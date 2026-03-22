#!/usr/bin/env python3
"""
Nuldam TTS Generator
Uses edge-tts to generate speech audio and VTT subtitles.

Usage:
  python tts_generate.py --text "텍스트" --output audio.mp3 --subtitle subtitle.vtt [--voice ko-KR-SunHiNeural] [--rate +0%]
"""

import argparse
import asyncio
import sys
import os
import re
import subprocess

try:
    import edge_tts
except ImportError:
    print("ERROR: edge-tts not installed. Run: pip install edge-tts", file=sys.stderr)
    sys.exit(1)


def format_time(seconds: float) -> str:
    """Format seconds as VTT timestamp HH:MM:SS.mmm"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f'{h:02d}:{m:02d}:{s:02d}.{ms:03d}'


def get_audio_duration(audio_path: str) -> float:
    """Get audio duration in seconds using ffprobe."""
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
             '-of', 'default=noprint_wrappers=1:nokey=1', audio_path],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
    except (subprocess.TimeoutExpired, FileNotFoundError, ValueError):
        pass

    # Fallback: estimate from file size (rough: ~16KB per second for mp3 at 128kbps)
    try:
        file_size = os.path.getsize(audio_path)
        return file_size / 16000.0
    except OSError:
        return 30.0  # default fallback


def create_sentence_vtt(text: str, total_duration: float, output_path: str) -> None:
    """Create VTT subtitles by splitting text into sentences with timed cues."""
    # Split by Korean and English sentence endings
    sentences = re.split(r'(?<=[.!?。？！\n])\s*', text)
    sentences = [s.strip() for s in sentences if s.strip()]

    if not sentences:
        sentences = [text]

    # If sentences are too long (>40 chars), split further by commas or clauses
    split_sentences = []
    for sentence in sentences:
        if len(sentence) > 60:
            # Split by comma, semicolon, or Korean clause markers
            parts = re.split(r'(?<=[,;，、])\s*|(?<=다)\s+|(?<=요)\s+', sentence)
            parts = [p.strip() for p in parts if p.strip()]
            if len(parts) > 1:
                split_sentences.extend(parts)
            else:
                split_sentences.append(sentence)
        else:
            split_sentences.append(sentence)

    sentences = split_sentences if split_sentences else [text]

    # Estimate duration per sentence based on character count (proportional)
    total_chars = sum(len(s) for s in sentences)
    if total_chars == 0:
        total_chars = 1

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('WEBVTT\n\n')
        current_time = 0.0
        for i, sentence in enumerate(sentences):
            # Proportional duration based on character count
            char_ratio = len(sentence) / total_chars
            duration = char_ratio * total_duration

            # Ensure minimum 1s and maximum 8s per cue
            duration = max(1.0, min(8.0, duration))

            start = current_time
            end = min(current_time + duration, total_duration)

            # Last sentence: extend to total duration
            if i == len(sentences) - 1:
                end = total_duration

            f.write(f'{format_time(start)} --> {format_time(end)}\n')
            f.write(f'{sentence}\n\n')

            current_time = end


async def generate_tts(
    text: str,
    output_path: str,
    subtitle_path: str,
    voice: str = "ko-KR-SunHiNeural",
    rate: str = "+0%",
) -> dict:
    """Generate TTS audio and VTT subtitle file."""
    # Ensure output directories exist
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    os.makedirs(os.path.dirname(subtitle_path) or ".", exist_ok=True)

    communicate = edge_tts.Communicate(text, voice, rate=rate)

    # Generate audio using save() method
    await communicate.save(output_path)

    # Get actual audio duration
    audio_duration = get_audio_duration(output_path)
    print(f"[TTS] Audio duration: {audio_duration:.2f}s", file=sys.stderr)

    # Generate VTT subtitle
    # Try edge-tts SubMaker first for word-level timing
    vtt_generated = False
    try:
        submaker = edge_tts.SubMaker()
        communicate2 = edge_tts.Communicate(text, voice, rate=rate)
        word_count = 0
        async for chunk in communicate2.stream():
            if chunk["type"] == "WordBoundary":
                submaker.feed(chunk)
                word_count += 1

        if word_count > 0:
            # Try different API methods for subtitle generation
            vtt_content = None
            for method_name in ["generate_subs", "get_subs", "subs"]:
                method = getattr(submaker, method_name, None)
                if method and callable(method):
                    vtt_content = method()
                    break

            if vtt_content and len(vtt_content.strip()) > 20:
                # Validate that VTT has multiple cues (not just one big block)
                cue_count = vtt_content.count('-->')
                if cue_count >= 2:
                    with open(subtitle_path, "w", encoding="utf-8") as sub_file:
                        sub_file.write(vtt_content)
                    vtt_generated = True
                    print(f"[TTS] SubMaker VTT generated with {cue_count} cues", file=sys.stderr)
                else:
                    print(f"[TTS] SubMaker produced only {cue_count} cue(s), using sentence-based fallback", file=sys.stderr)
            else:
                print("[TTS] SubMaker returned empty/short content, using sentence-based fallback", file=sys.stderr)
        else:
            print("[TTS] No WordBoundary events received, using sentence-based fallback", file=sys.stderr)
    except Exception as e:
        print(f"[TTS] SubMaker failed ({e}), using sentence-based fallback", file=sys.stderr)

    # Fallback: create sentence-based VTT
    if not vtt_generated:
        print(f"[TTS] Creating sentence-based VTT ({audio_duration:.2f}s total)", file=sys.stderr)
        create_sentence_vtt(text, audio_duration, subtitle_path)

    # Get file sizes
    audio_size = os.path.getsize(output_path)
    subtitle_size = os.path.getsize(subtitle_path)

    return {
        "audio_path": output_path,
        "subtitle_path": subtitle_path,
        "audio_size_bytes": audio_size,
        "subtitle_size_bytes": subtitle_size,
        "audio_duration_seconds": round(audio_duration, 2),
        "voice": voice,
        "rate": rate,
    }


def main():
    parser = argparse.ArgumentParser(description="Nuldam TTS Generator")
    parser.add_argument("--text", help="Text to convert to speech")
    parser.add_argument("--text-file", help="Path to file containing text (UTF-8)")
    parser.add_argument("--output", required=True, help="Output audio file path (.mp3)")
    parser.add_argument("--subtitle", required=True, help="Output subtitle file path (.vtt)")
    parser.add_argument("--voice", default="ko-KR-SunHiNeural", help="TTS voice name")
    parser.add_argument("--rate", default="+0%", help="Speech rate (e.g., +10%, -5%)")

    args = parser.parse_args()

    # Get text from --text or --text-file
    if args.text_file:
        with open(args.text_file, "r", encoding="utf-8") as f:
            text = f.read().strip()
    elif args.text:
        text = args.text
    else:
        print("ERROR: Either --text or --text-file is required", file=sys.stderr)
        sys.exit(1)

    import json

    result = asyncio.run(
        generate_tts(
            text=text,
            output_path=args.output,
            subtitle_path=args.subtitle,
            voice=args.voice,
            rate=args.rate,
        )
    )

    # Output result as JSON to stdout for Node.js wrapper to parse
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
