import type { ExplanationFacts } from "../../engine/explain";

/**
 * What the AI receives. Privacy by construction: only aggregated numbers go out. Never the sales rows and never the product name:
 * the AI is told to call the product [[PRODUCT]] and the real name is put back here, after the answer. (A product name is text typed by a
 * user: keeping it out also means it cannot be used to steer the AI.)
 */
export const PRODUCT_TOKEN = "[[PRODUCT]]";

export function buildPrompt(facts: ExplanationFacts, language: string): { system: string; user: string } {
  const languageName = language === "en" ? "English" : "Italian";
  const system =
    "You write short explanations of sales forecasts for owners of small businesses. " +
    "Use ONLY the facts in the JSON you receive. Do not invent figures and do not compute new ones " +
    "(no new sums, differences or percentages): you may round the numbers you are given. " +
    "If the facts show a wide confidence interval or a method not better than the naive benchmark, say that the forecast is uncertain. " +
    'The method "blend" in methodUsed means the average of the ETS and LightGBM forecasts. ' +
    "If zeroDaysPercent is 20 or more, say that the series has many days with zero sales and that the forecast is unreliable. " +
    "Do not give investment or purchasing advice. Do not mention JSON or field names. " +
    `Refer to the product only as ${PRODUCT_TOKEN}, written exactly like that. ` +
    `Write in ${languageName}, in 3 to 5 sentences, as plain text with no markdown and no lists.`;

  const { productName: _name, ...anonymous } = facts;
  const user = `Facts (JSON):\n${JSON.stringify(anonymous)}\n\nWrite the explanation in ${languageName}.`;
  return { system, user };
}

/** Puts the real product name where the AI wrote the placeholder. */
export const restoreProductName = (text: string, productName: string): string => text.split(PRODUCT_TOKEN).join(productName);
