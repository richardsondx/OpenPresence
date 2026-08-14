import type { SocialAssetKind } from "./types";

/**
 * Source-backed media used by the deterministic Sandbox market fixture.
 *
 * These are official, publicly renderable FRED/Federal Reserve graphs rather
 * than generated SVGs. The source page is kept separately from the media URL
 * so a reviewer can verify the data behind what is shown in the feed.
 */
export interface MarketSourceAsset {
  name: string;
  publisher: string;
  kind: Extract<SocialAssetKind, "chart" | "image">;
  mediaUrl: string;
  sourcePageUrl: string;
}

export const MARKET_SOURCE_ASSETS: MarketSourceAsset[] = [
  {
    name: "Consumer Price Index for All Urban Consumers",
    publisher: "Federal Reserve Bank of St. Louis · FRED",
    kind: "chart",
    mediaUrl: "https://fred.stlouisfed.org/graph/fredgraph.png?id=CPIAUCSL",
    sourcePageUrl: "https://fred.stlouisfed.org/series/CPIAUCSL",
  },
  {
    name: "Civilian Unemployment Rate",
    publisher: "Federal Reserve Bank of St. Louis · FRED",
    kind: "chart",
    mediaUrl: "https://fred.stlouisfed.org/graph/fredgraph.png?id=UNRATE",
    sourcePageUrl: "https://fred.stlouisfed.org/series/UNRATE",
  },
  {
    name: "Effective Federal Funds Rate",
    publisher: "Federal Reserve Bank of St. Louis · FRED",
    kind: "chart",
    mediaUrl: "https://fred.stlouisfed.org/graph/fredgraph.png?id=DFF",
    sourcePageUrl: "https://fred.stlouisfed.org/series/DFF",
  },
  {
    name: "Crude Oil Prices: West Texas Intermediate",
    publisher: "Federal Reserve Bank of St. Louis · FRED",
    kind: "chart",
    mediaUrl: "https://fred.stlouisfed.org/graph/fredgraph.png?id=DCOILWTICO",
    sourcePageUrl: "https://fred.stlouisfed.org/series/DCOILWTICO",
  },
  {
    name: "Personal Consumption Expenditures Price Index",
    publisher: "Board of Governors of the Federal Reserve System",
    kind: "chart",
    mediaUrl: "https://www.federalreserve.gov/newsevents/images/powell-figure1-20231109.png",
    sourcePageUrl: "https://www.federalreserve.gov/newsevents/speech/powell20231109a.htm",
  },
];

export interface MarketMockCandidate {
  text: string;
  asset: MarketSourceAsset;
}

/**
 * Long-form market notes intentionally use multiple paragraphs. The target's
 * public corpus consistently uses a lead, several evidence paragraphs, and a
 * closing implication; two-sentence Sandbox fixtures could not exercise that
 * shape or the source/provenance path.
 */
export const MARKET_MOCK_CANDIDATES: MarketMockCandidate[] = [
  {
    asset: MARKET_SOURCE_ASSETS[0],
    text: `The inflation chart is a reminder that the path back to price stability is not a straight line.

Headline progress can look convincing while the level of prices keeps compounding underneath the surface. That distinction matters because households experience the level, not just the latest monthly change.

The second point is that a softer print does not automatically create room for aggressive policy easing. The rate decision still depends on the breadth of disinflation, the labor market, and the credibility of the next forecast.

This is why the chart belongs in the conversation. It gives the market a longer memory than a single headline and makes it harder to confuse a better month with a completed victory.

The source is FRED's CPI series. The interpretation is ours, and the chart should be checked before using it for a live claim.`,
  },
  {
    asset: MARKET_SOURCE_ASSETS[1],
    text: `The labor market can cool without breaking all at once.

That is the important signal in the unemployment series. A gradual rise changes the distribution of outcomes long before it looks like a crisis in the headline data. Hiring becomes more selective, job searches take longer, and the cost of waiting is carried unevenly across households.

Markets often react to the direction before the level becomes alarming. If the rate is drifting higher while financial conditions remain tight, the question is whether demand is absorbing the shock or simply lagging it.

One data point cannot answer that question. A time series can at least show whether the latest move is an isolated print or part of a developing regime.

This is the official FRED unemployment series, not a synthetic chart. The source link matters as much as the visual.`,
  },
  {
    asset: MARKET_SOURCE_ASSETS[2],
    text: `Policy rates are the price of time, and the market keeps trying to price the next decision before the data confirms it.

The effective federal funds rate shows how quickly the policy regime can move when the central bank decides the previous setting no longer fits the economy. That history is useful because it makes every current forecast look less permanent.

The mistake is to treat one expected cut as a full easing cycle. The path, the pace, and the reason for the move are different questions. A cut caused by improving inflation is not the same signal as a cut forced by weakening activity.

That distinction flows through bonds, currencies, housing, and the valuation of long-duration equities. The headline action is small; the distribution of consequences is not.

The chart is the FRED effective federal funds rate series and should remain attached to the claim whenever this note is reused.`,
  },
  {
    asset: MARKET_SOURCE_ASSETS[3],
    text: `Oil is not only an energy story. It is a transmission mechanism into inflation expectations, transportation costs, margins, and household budgets.

The West Texas Intermediate series makes that transmission visible over a longer window. The market does not need a permanent supply shock for the damage to begin; it only needs uncertainty about how long the disruption will last.

That is why a sharp move in crude can matter even when the first-round effect on the index looks contained. Businesses start revisiting costs, consumers delay discretionary purchases, and policymakers have less confidence in the next inflation reading.

The right question is not whether oil is up today. It is whether the move is broadening into expectations and behavior.

This media is the FRED WTI series. It is source-backed public data, not an AI-rendered illustration.`,
  },
  {
    asset: MARKET_SOURCE_ASSETS[4],
    text: `The market wants a single inflation number because a single number is easy to trade.

The policy problem is more complicated. The Federal Reserve's own published chart separates the headline path from the underlying trend, which is a useful reminder that the composition of inflation matters alongside the direction.

If the improvement is concentrated in a few volatile categories, confidence should remain limited. If it is broad and persistent, the same headline can support a very different policy conclusion.

This is also why source selection matters. A chart without a publisher, a series name, or a link back to the underlying data is decoration. A chart with provenance can be checked, challenged, and updated.

This attachment comes from the Federal Reserve's public material; the source page is retained with the media.`,
  },
  {
    asset: MARKET_SOURCE_ASSETS[0],
    text: `The most useful macro chart is often the one that refuses to give a clean answer.

Consumer prices can moderate while the level remains elevated. That creates a gap between what the latest release says and what people feel in recurring expenses. It also creates a gap between the market's first reaction and the policy path that follows.

Investors should separate three questions: is inflation slowing, is it broadening or narrowing, and is the level consistent with the central bank's objective? Collapsing those questions into “good CPI” or “bad CPI” hides the real uncertainty.

The longer series helps keep the frame intact. It is not a prediction, but it is a guardrail against overreacting to one release.

The attached graphic is generated by FRED from the CPIAUCSL series, with the source page available for verification.`,
  },
  {
    asset: MARKET_SOURCE_ASSETS[1],
    text: `A cooling labor market can look healthy right up until the margin disappears.

The unemployment series is not a complete employment report, but it is a useful check on narratives that depend on permanent resilience. When the direction changes, the market has to revisit how much demand can be carried by wage growth and how much is being financed by savings or credit.

That matters for equities, housing, and consumer-facing businesses at the same time. A slower hiring backdrop changes the hurdle for every optimistic forecast, even if the aggregate level still looks historically benign.

The trade here is between speed and confidence. Fast conclusions are tempting; a source-backed series encourages the slower, more durable read.

This is the official FRED unemployment chart and is shown with its source attribution.`,
  },
  {
    asset: MARKET_SOURCE_ASSETS[2],
    text: `The policy rate is not just a line on a chart. It is the input that changes the price of almost every other decision.

When rates stay high, the adjustment appears in refinancing, housing turnover, capital investment, and the valuation of future cash flows. When they fall, the first reaction can be relief, but the reason for the move determines whether that relief lasts.

A market that prices cuts without a clear improvement in the underlying data is vulnerable to a reset. A market that ignores a genuine turn in the data is vulnerable in the other direction.

The best discipline is to keep the policy path beside the evidence rather than treating the forecast as the evidence.

The source-backed attachment is the FRED effective federal funds rate series.`,
  },
  {
    asset: MARKET_SOURCE_ASSETS[3],
    text: `Energy shocks expose how quickly a macro story can move from markets into ordinary decisions.

Higher crude prices raise the cost of moving goods, heating buildings, and producing anything that depends on transport. The first impact may show up in a chart; the second shows up in margins; the third shows up in what households stop buying.

That sequence is why the duration of a shock matters more than the first headline move. A brief spike can be absorbed. A persistent move can change expectations and force businesses to reprice.

The market may call this a commodity trade, but the policy response is a broader inflation and growth trade.

The attachment is the live FRED WTI series with a direct link to the underlying source page.`,
  },
  {
    asset: MARKET_SOURCE_ASSETS[4],
    text: `A credible market note should make it easy to answer three questions: what is the claim, what is the evidence, and where can the reader verify it?

That standard is especially important for charts. Visual polish can create false confidence when the data series, publisher, and date are missing. The Federal Reserve's public material is useful here because the original context remains available beside the graphic.

The interpretation still requires judgment. A source does not turn a chart into a forecast, and a forecast does not become a fact because it is written with urgency.

The durable format is simple: show the series, name the uncertainty, and explain what would change the view.

This post uses a Federal Reserve chart with its source page attached, so the reader can inspect the origin instead of trusting a placeholder.`,
  },
  {
    asset: MARKET_SOURCE_ASSETS[0],
    text: `The headline inflation debate is usually too short-term.

The market reacts to the latest release, but the more useful question is whether the underlying path is becoming easier to forecast. A series that moves slowly but consistently can be more informative than a dramatic one-month improvement followed by reversals.

That distinction changes how investors think about duration, earnings, and policy risk. Lower inflation is helpful; lower uncertainty about inflation is what allows the rest of the system to plan.

This is also a reminder that a chart should travel with its provenance. The visual is only the first layer. The source page, series name, and update path are what make the observation reusable.

The media is the official FRED CPIAUCSL chart, linked back to its series page.`,
  },
  {
    asset: MARKET_SOURCE_ASSETS[1],
    text: `The labor market does not need to collapse for the market to become more selective.

Small changes in unemployment can alter bargaining power, household confidence, and the willingness of businesses to keep investing ahead of demand. Those effects are difficult to see in a single headline but easier to understand when the longer series stays in view.

The important signal is the relationship between labor, rates, and credit. If all three are tightening together, the cost of a soft landing rises. If one starts to ease without the others, the signal is more ambiguous.

No chart can settle that debate by itself. It can make the debate honest by showing what the data actually did.

This is a real FRED series rendered from the official source, with the source page preserved in the asset metadata.`,
  },
];

export function marketMockCandidate(progress: number, rejectedCandidates = 0): MarketMockCandidate {
  return MARKET_MOCK_CANDIDATES[(progress + rejectedCandidates) % MARKET_MOCK_CANDIDATES.length]!;
}
