# Validation handoff

## Implemented in this change

Result comparison presents at most three distinct, non-quarantined candidates meeting the existing verdict percentile band, including an explicit empty state. Main comparison, candidate traits and share-card inputs use the filtered candidates too. Quarantined catalog subjects cannot be opened through siteResult or suggested by catalog search. Underlying historical catalog counts, calibration and map assets are not regenerated from unverified replacement images.

This presentation filter is not a human-calibrated strong-match threshold. It can improve restraint, but no improved precision is claimed. MobileCLIP remains selected; the prior DINOv2 experiment does not justify promotion.

## Participant returns

The public questionnaire remains unchanged. Ask participants to send the downloaded JSON when possible. Save received files outside version control (for example quality/generated/human-input). Never treat automated QA runs as participant submissions.

Run:

```
node scripts/human-results.mjs quality/generated/human-summary.json quality/generated/human-input/person1.json quality/generated/human-input/person2.json
```

The importer accepts only complete files for pairs-60-v1, rejects repeated session IDs, unknown pairs and invalid responses, and refuses to overwrite an output or input file. It summarizes agreement and flags missing second opinions, uncertainty and non-evaluable pairs. It does not copy free-text comments to the aggregate; retain original files for adjudication. No automatic majority label or production accuracy estimate is produced. Browser sessions do not prove unique human identities. WhatsApp text needs to be reconciled against the original JSON rather than silently guessed.

These 60 pairs are an exploratory reused sample. A separate 100-query study, with development and untouched test separation and independent review, is still required before a precision claim. No responses have yet been received.

## Capture review outcome

On 2026-11-08 the web retrieval tool could not access any of the five quarantined URLs. This is a tool limitation, not proof that the sites are dead. No new screenshot or embedding has been substituted. Existing image hashes and questionnaire assets remain fixed. Recapture must verify the actual target project before quarantine is lifted.

## Remaining gates

- Verified replacement captures and coherent regeneration of embeddings/calibration/map assets.
- Independent human returns, disagreement resolution and a fresh held-out evaluation. Do not tune on held-out responses.
- Physical iPhone/Safari and live-host checks; desktop build/tests cannot establish these.
- Actual operator identity and seller configuration, provider-backed payment/invoice/refund/delivery tests before charging.
- Reviewed integration and release decision. Production publication remains paused; draft PRs are deliverables, not deployed features.

The original eight-step goal is not complete while these evidence gates remain open. No paid service, human audit, 90% precision or release readiness is asserted.
