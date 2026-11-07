# Product decision after expanded DINOv2 evaluation

## Evidence

`npm run quality:dinov2-pairs` encodes the 99 unique thumbnails in the existing 60 AI-annotated pairs with DINOv2-small FP16 on Node CPU. It preserves the development/test split and selects the threshold on development only, using the same balanced-accuracy objective and tie rule as the committed MobileCLIP evaluation.

| Previously annotated test set (30 pairs) | MobileCLIP | DINOv2 |
|---|---:|---:|
| Strong pairs detected | 2/4 | 4/4 |
| Other pairs falsely called strong | 1/26 | 11/26 |
| Precision on this sample | 2/3 | 4/15 |

These are previously used, AI-labeled exploratory pairs, not a new independent holdout or human validation. The MobileCLIP comparison uses the committed browser catalog vectors; DINOv2 uses CPU inference. Timing/stability results from the earlier 12-image pool did not establish semantic accuracy. No model replacement or confidence threshold is promoted from this experiment.

## Product changes

- Keep MobileCLIP. DINOv2's higher detection rate comes with too many false positives in this experiment for the current first-contact goal.
- Replace categorical result headlines with counts of catalog entries to inspect. A zero count is described as below the selected threshold, not evidence that the page is original.
- Remove the originality badge from results while validation remains incomplete.
- Explain that percentiles are relative positions among catalog pairs, not similarity percentages or probabilities of correctness.
- Present identical audited captures once in the visual results, preserving ranking and naming that grouping. Raw counts still count entries; no recalibration or data deletion is implied. The audit hash is checked against the shipped catalog in tests.
- Remove suggestions that fewer matches automatically imply a better design. Generated summaries describe estimated signals and hypotheses to check against the page's goal.

## Limits

The duplicate groups remain in underlying embeddings/calibration until capture provenance is independently resolved. Grouping removes repetitive display, not statistical duplication. Existing DINOv2 evidence may help select difficult cases for human review; it does not authorize a public claim of improved accuracy. Production publication remains paused.
