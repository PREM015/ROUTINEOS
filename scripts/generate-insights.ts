export async function generateInsights() {
  return {
    ok: true,
    generated: 0,
    message: 'Insight generation job is ready to be wired to cron endpoints.',
  };
}
