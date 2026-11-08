# Capture quarantine

AI visual inspection of the stored duplicate captures identified five project entries displaying the same Polsia provider landing page: Aria, DocketHearth, Locale, Pricelet and Yarrow. Their actual current URLs were not inspected; the cause of the mismatch is unknown. These are suspect project representations, not confirmed dead sites.

`quality/capture-review.json` records the image hashes and decision. `distinctCaptures` removes these entries from displayed candidate lists and uploaded-image candidate retrieval before truncation. The underlying records remain recoverable. Compeddit and TwiFlux duplicate groups show recognizable product pages and remain grouped, not quarantined.

This is a targeted review of nine entries in three exact-duplicate groups, not a semantic audit of all 2,003 captures. Raw band counts, map positions and calibration still use the historical catalog; this change does not certify those statistics or alter their interpretation. Static exploration data can still contain quarantined entries outside filtered candidate lists. Broader catalog regeneration awaits verified replacement captures.

To restore an entry: capture the intended project, review its identity and completeness, update the recorded decision, re-embed the replacement and regenerate derived data consistently. A changed capture hash fails the regression check until the review is updated.

The participant questionnaire and its 60 pairs remain frozen. No participant answers or human validation are inferred. Production deployment remains paused.
