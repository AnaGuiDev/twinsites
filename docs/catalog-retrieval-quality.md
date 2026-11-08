# Unique capture retrieval

Uploaded images now select up to 12 distinct audited captures before truncating the ranking. Previously, repeated captures occupied slots in the 12 nearest entries and were only hidden by the result view. The candidate traits used for suggestions now also come from this distinct list.

The highest scoring entry represents each byte-identical capture group. Scores and original catalog indices are preserved. No minimum result count is fabricated when fewer distinct captures exist. This is candidate diversity, not evidence of improved semantic accuracy.

The three audited groups cover nine catalog entries and six redundant captures. Tests check their current image bytes, as well as the catalog hash: changing a screenshot without revisiting its duplicate group must fail the check.

Raw band counts, calibration, map placement, catalog entries and embeddings are unchanged. Existing static exploration pages retain their current precomputed candidates. Unknown capture provenance, semantic error-page detection and recalibration remain pending; this change does not certify the full catalog as clean.

The 60-pair participant questionnaire and its image files are frozen and unchanged. No human results have been received or inferred. Production publication remains paused.

Validation: regression covers duplicate candidates crowding out alternatives, selection of the highest scoring representative, preserved indices, insufficient distinct entries and zero requested results. Byte checks cover all three audited groups.
