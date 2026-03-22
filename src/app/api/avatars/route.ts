import type { ApiResponse } from '@/types';

// ─── Curated Avatar List ─────────────────────────────────────────────────────

interface CuratedAvatar {
  id: string;
  name: string;
  category: 'custom' | 'professional' | 'casual' | 'diverse';
  preview_url?: string;
}

const CURATED_AVATARS: CuratedAvatar[] = [
  // Custom avatar (pinned first)
  { id: '289259c61ef142ebba0bb463f35f864b', name: '진해수 (대표이사)', category: 'custom' },

  // Professional female
  { id: 'Abigail_expressive_2024112501', name: 'Abigail', category: 'professional' },
  { id: 'Adriana_Business_Front_public', name: 'Adriana', category: 'professional' },
  { id: 'Anna_public_3_20240108', name: 'Anna', category: 'professional' },
  { id: 'Briana_public_3_20240110', name: 'Briana', category: 'professional' },
  { id: 'Daisy-inskirt-20220818', name: 'Daisy', category: 'professional' },

  // Professional male
  { id: 'Adrian_public_3_20240312', name: 'Adrian', category: 'professional' },
  { id: 'Andrew_public_pro1_20230614', name: 'Andrew', category: 'professional' },
  { id: 'Edward_public_3_20240110', name: 'Edward', category: 'professional' },
  { id: 'Josh_lite3_20230714', name: 'Josh', category: 'professional' },
  { id: 'Tyler-incasual-20220721', name: 'Tyler', category: 'professional' },

  // Casual / diverse female
  { id: 'Kayla-incasual-20220818', name: 'Kayla', category: 'casual' },
  { id: 'Lisa_public_3_20240110', name: 'Lisa', category: 'casual' },
  { id: 'Monica_public_3_20240110', name: 'Monica', category: 'diverse' },
  { id: 'Natalie_Casual_Front_public', name: 'Natalie', category: 'diverse' },
  { id: 'Sofia_public_3_20240110', name: 'Sofia', category: 'diverse' },

  // Casual / diverse male
  { id: 'Blake_public_3_20240110', name: 'Blake', category: 'casual' },
  { id: 'Justin_public_3_20240110', name: 'Justin', category: 'casual' },
  { id: 'Marco_public_3_20240110', name: 'Marco', category: 'diverse' },
  { id: 'Raj_public_3_20240110', name: 'Raj', category: 'diverse' },
  { id: 'Wei_public_3_20240110', name: 'Wei', category: 'diverse' },
];

// ─── GET /api/avatars ────────────────────────────────────────────────────────

export async function GET() {
  try {
    const apiKey = process.env.HEYGEN_API_KEY;

    // If HeyGen API key is available, try to fetch preview URLs
    if (apiKey) {
      try {
        const response = await fetch('https://api.heygen.com/v2/avatars', {
          headers: { 'X-Api-Key': apiKey },
        });

        if (response.ok) {
          const result = await response.json() as {
            error: string | null;
            data: {
              avatars: Array<{
                avatar_id: string;
                avatar_name: string;
                preview_image_url?: string;
              }>;
            };
          };

          const apiAvatars = result.data?.avatars || [];
          const apiAvatarMap = new Map(
            apiAvatars.map((a) => [a.avatar_id, a])
          );

          // Enrich curated list with preview URLs from API
          const enrichedAvatars = CURATED_AVATARS.map((curated) => {
            const apiAvatar = apiAvatarMap.get(curated.id);
            return {
              id: curated.id,
              name: curated.name,
              category: curated.category,
              preview_url: apiAvatar?.preview_image_url || null,
            };
          });

          return Response.json({
            success: true,
            data: enrichedAvatars,
          } satisfies ApiResponse);
        }
      } catch {
        // API call failed, fall back to curated list without previews
      }
    }

    // Fallback: return curated list without preview URLs
    const avatars = CURATED_AVATARS.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      preview_url: null,
    }));

    return Response.json({
      success: true,
      data: avatars,
    } satisfies ApiResponse);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
