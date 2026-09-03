// src/api/civitaiService.ts

export interface CivitaiMetadataResult {
  previewUrl?: string;
  triggerWords?: string[];
  description?: string;
  modelId?: number;
  versionName?: string;
}

const CIVITAI_TYPE_MAP: Record<string, string> = {
  model: 'Checkpoint',
  lora: 'LORA',
  embedding: 'TextualInversion'
};

export const civitaiService = {
  cleanModelName(filename: string): string {
    return filename
      .replace(/\.(safetensors|ckpt|pt|bin)$/i, '')
      .replace(/^.*[\\/]/, '')
      .replace(/[-_]/g, ' ')
      .trim();
  },

  async fetchMetadata(
    filename: string,
    type: 'model' | 'lora' | 'embedding'
  ): Promise<CivitaiMetadataResult | null> {
    try {
      const cleanName = this.cleanModelName(filename);
      const civType = CIVITAI_TYPE_MAP[type] || 'LORA';

      const url = `https://civitai.com/api/v1/models?query=${encodeURIComponent(cleanName)}&types=${civType}&limit=1`;
      const res = await fetch(url);
      if (!res.ok) return null;

      const data = await res.json();
      if (!data.items || data.items.length === 0) return null;

      const item = data.items[0];
      const latestVersion = item.modelVersions?.[0];

      const triggerWords: string[] = latestVersion?.trainedWords || [];
      const previewUrl: string | undefined = latestVersion?.images?.[0]?.url;
      const description: string | undefined = item.description
        ? item.description.replace(/<[^>]*>/g, '').slice(0, 300)
        : undefined;

      return {
        previewUrl,
        triggerWords,
        description,
        modelId: item.id,
        versionName: latestVersion?.name
      };
    } catch (err) {
      console.warn(`[Civitai] Failed to fetch metadata for ${filename}:`, err);
      return null;
    }
  }
};