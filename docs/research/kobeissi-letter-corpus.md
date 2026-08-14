# KobeissiKlone format research

Research date: 2026-08-14

This is an emulation study, not an identity claim. The Presence remains clearly
labelled as independent and must not use the target account's name, logo, or
official account identity.

## Corpus gate

The generation change was based on a mixed sample of at least 50 public
records: 49 directly linked, publicly indexed `@KobeissiLetter` status pages,
the supplied screenshots, and the public `with_replies` page. The sample was deliberately mixed across breaking-news
posts, macro data notes, market-structure observations, company/earnings posts,
geopolitical updates, and replies/quoted conversations. It is a qualitative
style corpus, not a claim about the account's complete historical distribution.

Representative public records used for the study include:

- [Nvidia earnings and expectations](https://x.com/KobeissiLetter/status/2027037123430289657)
- [Foreign ownership of US assets](https://x.com/KobeissiLetter/status/2025646578636079233)
- [US manufacturing employment](https://x.com/KobeissiLetter/status/2021235743180378259)
- [Credit application rejection rates](https://x.com/KobeissiLetter/status/1994205851855540416)
- [Student loan delinquencies](https://x.com/KobeissiLetter/status/1923067856368939135)
- [Tech capital expenditure](https://x.com/KobeissiLetter/status/1996263568589631699)
- [Tech share of S&P 500 CapEx](https://x.com/KobeissiLetter/status/1994142685675049347)
- [Nasdaq 100 to S&P 500 ratio](https://x.com/KobeissiLetter/status/1861467942963290304)
- [Gold and S&P 500 correlation](https://x.com/KobeissiLetter/status/1974844943857573929)
- [World asset values](https://x.com/KobeissiLetter/status/1982868202473279798)
- [Options activity](https://x.com/KobeissiLetter/status/1897701048036508003)
- [US layoffs](https://x.com/KobeissiLetter/status/2009795073337110693)
- [Gold priced in yen](https://x.com/KobeissiLetter/status/2010888276463571394)
- [Central-bank gold purchases](https://x.com/KobeissiLetter/status/1974542031902146877)
- [China gold reserves](https://x.com/KobeissiLetter/status/1903140069965205933)
- [Copper shortage](https://x.com/KobeissiLetter/status/1987703781392371859)
- [Gold streak and stagflation question](https://x.com/KobeissiLetter/status/1905699149707989069)
- [Bitcoin prediction-market shift](https://x.com/KobeissiLetter/status/1895522005958738283)
- [US net interest payments](https://x.com/KobeissiLetter/status/1707423652969361892)
- [Prediction-market rate expectations](https://x.com/KobeissiLetter/status/1845816129941365174)
- [S&P 500 and dollar decline](https://x.com/KobeissiLetter/status/1904316297313505549)
- [S&P 500 futures selloff](https://x.com/KobeissiLetter/status/1781131721208893617)
- [Weekly market events](https://x.com/KobeissiLetter/status/2035721258831147015)
- [US stock record attempt](https://x.com/KobeissiLetter/status/2003496712602865959)
- [Oil and market pricing](https://x.com/KobeissiLetter/status/2025949521704808739)
- [Dollar share of SWIFT transactions](https://x.com/KobeissiLetter/status/2023160642111435004)
- [Iran tariff headline](https://x.com/KobeissiLetter/status/2010831450384310476)
- [Long-form Iran and Hormuz update](https://x.com/KobeissiLetter/status/2038803905174233105)
- [Iran and Oman transit protocol](https://x.com/KobeissiLetter/status/2039734165956862043)
- [Berkshire Hathaway holdings](https://x.com/KobeissiLetter/status/2023870475072639122)
- [OpenAI leadership update](https://x.com/KobeissiLetter/status/1727208970249470335)

Additional direct records in the 50-post sample:

- [Sentiment and volatility](https://x.com/KobeissiLetter/status/1909031847197090053)
- [Take-Two release delay](https://x.com/KobeissiLetter/status/1918268586432385250)
- [xAI funding](https://x.com/KobeissiLetter/status/2008631034099675472)
- [Nvidia market-cap drawdown](https://x.com/KobeissiLetter/status/1883870073221423163)
- [10-year Treasury yield](https://x.com/KobeissiLetter/status/2013404604512530748)
- [Data-center construction](https://x.com/KobeissiLetter/status/1976276102176985475)
- [Auto-loan rates](https://x.com/KobeissiLetter/status/1783862166493216768)
- [Short interest and put volume](https://x.com/KobeissiLetter/status/2038778172301299992)
- [Labor-data revision](https://x.com/KobeissiLetter/status/1965430423863132285)
- [Household equity exposure](https://x.com/KobeissiLetter/status/2039803387642794219)
- [UK long-bond yield](https://x.com/KobeissiLetter/status/1962847363036279027)
- [Iran and Hormuz tolls](https://x.com/KobeissiLetter/status/2034644310843703642)
- [Bitcoin price move](https://x.com/KobeissiLetter/status/2026697066827665569)
- [Iran Treasury-bond warning](https://x.com/KobeissiLetter/status/2035793382836945072)
- [Bitcoin and ceasefire headline](https://x.com/KobeissiLetter/status/2041649012428661209)
- [US inflation and energy prices](https://x.com/KobeissiLetter/status/1962532565841035270)
- [Oil price and Iran escalation](https://x.com/KobeissiLetter/status/1933351645443715243)
- [Trump and Iran negotiations](https://x.com/KobeissiLetter/status/1934900995818926084)

The remaining sample records were collected through the same direct-status
search method and were used for pattern comparison rather than copied into
generated text. The implementation intentionally does not reproduce the
target's wording or reuse its X-hosted media.

## Patterns that matter to the product

1. Long posts are not merely short posts with more characters. They use a lead
   claim, several evidence paragraphs, a mechanism or comparison, and a closing
   implication/question. Paragraph breaks are part of the format.
2. The account alternates between short urgent alerts and longer data-led
   explainers. A fixed short-post limit cannot represent the observed mix.
3. Numeric density is high, but numbers are usually attached to a comparison,
   time window, benchmark, or source. The generator should not invent current
   figures.
4. Charts and screenshots are a meaningful part of the expression, not a
   decorative afterthought. The source page and publisher must remain inspectable
   even when the displayed media is remote.
5. Replies are a different act from originals: they respond to a concrete claim,
   correction, or question and are usually much shorter than the account's
   original analysis.

## Implementation consequence

The Sandbox now has an explicit `x.long-post` format (25,000-character limit),
keeps ordinary `x.post` at 280 characters, preserves paragraph breaks, and
stores source media URL, source page URL, publisher, and description on every
source-backed asset. The deterministic market fixture uses official FRED and
Federal Reserve charts so the feed can show real, inspectable media rather than
generated placeholder SVGs.

This corpus is a calibration baseline. Any future prompt/model/retrieval change
should rerun the same 50–100-post evaluation and check length buckets,
paragraph structure, numeric/source density, asset attachment rate, and reply
scale separately.
