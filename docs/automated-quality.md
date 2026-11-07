# Automated quality work before human validation

This package adds reproducible evidence and a conservative input abstention. It does not certify semantic accuracy or replace human labels.

## Catalog audit

Run `npm run quality:catalog`. `quality/catalog-audit.json` records the catalog hash, all exact byte duplicates, identical resized-pixel groups and image-size/uniformity flags. All 2,003 images were read successfully; three duplicate groups contain nine entries (six repetitions beyond one representative per group). No size, aspect-ratio or near-uniformity flags were raised. This says nothing about semantic error pages, banners, or whether a screenshot represents its URL correctly.

Visual inspection of the three representative images shows Polsia, Compeddit and a Twitter video downloader. The five Polsia entries share the same generic Polsia screenshot despite different catalog identities; their capture provenance needs checking. Entries are retained until provenance and recalibration are addressed. No automatic deletion or silent change to catalog counts is performed.

## Perturbation benchmark

Run `npm run quality:robustness`. The pinned FP16 graph processes 24 evenly spaced catalog entries and five variants each: repeat, JPEG quality 60, 75% resolution, 2% inset crop and 5% brightness increase. The report records cosine change, top-one retention and top-ten overlap, excluding the query entry itself from neighbors. Exact values are in `quality/robustness-node.json`.

| Perturbation | Same first neighbor | Mean top-ten overlap |
|---|---:|---:|
| Exact repeat | 24/24 | 100% |
| JPEG quality 60 | 22/24 | 84.6% |
| Resize to 75% | 16/24 | 84.2% |
| 2% inset crop | 14/24 | 85.4% |
| Brightness +5% | 21/24 | 89.6% |

The first neighbor changed for 10/24 small-crop variants. Therefore the interface explicitly describes the list as candidates, not confirmed matches. These fractions measure this experiment only, not product accuracy.

This is ONNX Runtime Node CPU inference, not browser or physical-mobile evidence. The minimum original-image cosine against the browser-encoded catalog was approximately 0.999 in this sample; equivalence is close but not exact. Timings include preprocessing/inference and depend on the host. Twenty-four selected catalog entries cannot establish population-level reliability, and perturbation stability does not establish correct semantic judgments.

## Product abstention

A nearly uniform or fully transparent reviewed region is refused before model loading, with an actionable message. This rule compares RGB range after alpha compositing at 96×60 resolution; its threshold is an engineering input check, not a calibrated confidence estimate. It does not detect every empty, occluded or erroneous page. The existing user confirmation remains necessary. Browser checks exercise corrupted files, low resolution, uniform images, valid preview and confirmation at desktop/mobile widths.

## Next experiments

- Initial controlled template and three-model comparison completed: see [model comparison](model-comparison.md). Expand to multiple independent page families.
- Re-run perturbations in browser WASM and on physical devices; measure ranking stability after excluding duplicate groups too.
- DINOv2/SigLIP2 have now been benchmarked offline on identical inputs. Extend the small retrieval pool and obtain independent labels before any replacement.
- Independently review duplicate capture provenance and suspicious semantic captures; rebuild calibration if the catalog changes.
- Derive a result-level abstention policy using independent labels. No unvalidated score margin is presented as a probability of correctness.
