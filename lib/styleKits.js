/**
 * Style kits: market id → Firefly prompt for background/style.
 */

export const styleKits = {
  'JP-Harajuku':
    'Tokyo Harajuku, neon, blue-hour street, gritty textures, street-snap photography, urban fashion',
  'JP-Ginza':
    'Tokyo Ginza, golden hour, marble and glass luxury storefronts, minimalist, high-end retail',
};

export const defaultChannels = [
  { id: 'pdp', width: 1200, height: 1200 },
  { id: 'social-vertical', width: 1080, height: 1350 },
  { id: 'ooh', width: 3000, height: 1500 },
];

export function getPromptForMarket(marketId) {
  return styleKits[marketId] || `Modern professional setting, ${marketId}`;
}
