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

try:
    import edge_tts
except ImportError:
    print("ERROR: edge-tts not installed. Run: pip install edge-tts", file=sys.stderr)
    sys.exit(1)


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

    # Generate audio file
    submaker = edge_tts.SubMaker()

    with open(output_path, "wb") as audio_file:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_file.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                submaker.feed(chunk)

    # Generate VTT subtitle file
    vtt_content = submaker.generate_subs()
    with open(subtitle_path, "w", encoding="utf-8") as sub_file:
        sub_file.write(vtt_content)

    # Get file sizes
    audio_size = os.path.getsize(output_path)
    subtitle_size = os.path.getsize(subtitle_path)

    return {
        "audio_path": output_path,
        "subtitle_path": subtitle_path,
        "audio_size_bytes": audio_size,
        "subtitle_size_bytes": subtitle_size,
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
