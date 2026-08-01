-- Apply if you already ran the older Vast-oriented schema.
ALTER TABLE templates ADD COLUMN IF NOT EXISTS min_vram_gb INT NOT NULL DEFAULT 24;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS gpu_tier TEXT NOT NULL DEFAULT '24gb';

UPDATE templates SET
  vast_endpoint = 'image_24',
  est_seconds_cold = 150,
  est_seconds_hot = 45,
  min_vram_gb = 24,
  gpu_tier = '24gb'
WHERE slug = 'image_fast';

UPDATE templates SET
  vast_endpoint = 'image_24',
  est_seconds_cold = 240,
  est_seconds_hot = 70,
  min_vram_gb = 24,
  gpu_tier = '24gb'
WHERE slug = 'image_std';

UPDATE templates SET
  vast_endpoint = 'video_24',
  est_seconds_cold = 300,
  est_seconds_hot = 120,
  min_vram_gb = 24,
  gpu_tier = '24gb',
  min_price_cents = 990
WHERE slug = 'video_fast';

UPDATE templates SET
  vast_endpoint = 'video_24',
  est_seconds_cold = 480,
  est_seconds_hot = 200,
  min_vram_gb = 24,
  gpu_tier = '24gb',
  min_price_cents = 1990
WHERE slug = 'video_std';
