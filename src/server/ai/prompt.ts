/**
 * AI Prompt Builder
 * Structured prompts for insight generation
 */

export function buildInsightPrompt(
  data: any,
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY'
): string {
  const periodConfig = {
    DAILY: {
      timeframe: 'today',
      focus: 'immediate patterns and quick wins',
    },
    WEEKLY: {
      timeframe: 'this week',
      focus: 'weekly trends and habit consistency',
    },
    MONTHLY: {
      timeframe: 'this month',
      focus: 'long-term patterns and strategic improvements',
    },
  };

  const config = periodConfig[period];

  return `You are a productivity coach analyzing ${config.timeframe}'s performance data.

**User Data Summary:**
${JSON.stringify(data, null, 2)}

**Your Task:**
Provide a concise, actionable analysis focusing on ${config.focus}.

**Required Sections:**
1. **Summary** (2-3 sentences): Overall performance
2. **Wins** (2-3 bullet points): What went well
3. **Patterns** (2-3 observations): Trends you notice
4. **Concerns** (1-2 items): Areas needing attention
5. **Suggestions** (3-5 actionable items): Specific improvements
6. **Next Period Focus** (1-2 sentences): Priority for next ${config.timeframe}

**Guidelines:**
- Be specific and data-driven
- Focus on actionable insights
- Keep language motivational but honest
- Reference actual numbers from the data
- Don't make assumptions beyond the data
- Keep total response under 500 words

**Output Format:**
Return ONLY valid JSON with this structure:
{
  "summary": "string",
  "wins": ["string"],
  "patterns": ["string"],
  "concerns": ["string"],
  "suggestions": ["string"],
  "nextPeriodFocus": "string"
}`;
}