# Controlled comparison: MobileCLIP, DINOv2 and SigLIP2

## Decision

Keep the production candidate unchanged. DINOv2-small merits a larger independent evaluation as an auxiliary structural signal. This experiment does not justify replacing MobileCLIP or adding the larger SigLIP2 model to the visitor's download.

## Executed protocol

- Three actual ONNX FP16 models, local CPU inference using Transformers.js 3.8.1. No paid inference API, customer images or external uploads.
- 32 rendered screenshots: one synthetic template with eight parameter settings, each rendered as base, recolored, text-replaced and rearranged. These are correlated controlled interventions, not eight independent design families or human labels.
- 12 evenly spaced real catalog thumbnails, each in original, JPEG quality 60, 75% resolution and 2% inset-crop form. Retrieval searches only the other 11 original thumbnails. This pool is deliberately identical for all three models; it is not the full 2,003-site catalog and cannot be compared directly with the previous robustness percentages.
- Same two overlapping square crops and normalized mean for all models. Published processors remain model-specific. MobileCLIP uses image_embeds, DINOv2 uses the CLS token from last_hidden_state, SigLIP2 uses pooler_output.
- 80 image encodings per model, 240 total. Host timings include preprocessing and inference but exclude image decoding and cold model loading. No repeated performance trials, GPU or physical-device claim.
- Synthetic PNG hashes, model revisions, file sizes and SHA-256 hashes are retained. Rendering uses system fonts; a different font environment can change image hashes and outcomes.

## Findings

| Measure | MobileCLIP S0 | DINOv2-small | SigLIP2 base |
|---|---:|---:|---:|
| First real neighbor retained: JPEG | 11/12 | 12/12 | 8/12 |
| First real neighbor retained: resize | 10/12 | 12/12 | 8/12 |
| First real neighbor retained: crop | 11/12 | 12/12 | 7/12 |
| Text change closer than rearrangement | 0/8 | 8/8 | 0/8 |
| Recolor closer than rearrangement | 0/8 | 0/8 | 0/8 |
| Median encode time on this host | 241 ms | 215 ms | 353 ms |
| FP16 graph bytes | 22,876,479 | 44,420,939 | 186,039,516 |

DINOv2 retained the first neighbor more often in this small pool and was less sensitive to text replacement in the synthetic scenario. It did not show the hypothesized preference for unchanged geometry under recoloring. None of these counts is semantic accuracy. Cosine scales differ across models; compare within-model orderings, not raw similarity magnitudes between models.

The synthetic layout change moves and resizes elements while keeping content/colors; the recolor changes the full palette, including dark-to-light cases. Its effect may reasonably be large. These are diagnostic probes, not pass/fail definitions of visual resemblance. No tuning or threshold was selected from these results.

## Reproduce

`npm run quality:models`

Requires Node 20+, root dependencies and curl. The first run downloads approximately 230 MB of experimental ONNX graphs into the ignored `quality/generated/model-comparison/models` directory, verifies pinned hashes, regenerates fixtures and executes the benchmark. The shipping MobileCLIP model is prepared separately with its existing pinned hash. Alternative weights are not bundled in the app or committed to Git.

Outputs:
- `quality/model-comparison.json`: full scores, timings and complete=true only when all three models finished.
- `quality/controlled-fixtures.json`: actual rendered input hashes and renderer versions.
- `quality/model-comparison-downloads.json`: pinned alternative model files and integrity records.
- `quality/generated/model-comparison/fixtures`: regenerated images for inspection.

## Remaining evidence before changing the model

Expand to multiple independent layout families and a larger real retrieval pool; evaluate false matches and misses with independent human labels; test WASM/browser parity, memory and mobile latency; review licenses and deployment compatibility for the exact artifacts before redistribution. A more stable ranking can still be wrong. No human validation or model replacement is claimed here.

Model sources:
- https://huggingface.co/onnx-community/dinov2-small (conversion of facebook/dinov2-small)
- https://huggingface.co/onnx-community/siglip2-base-patch16-224-ONNX (conversion of google/siglip2-base-patch16-224)
