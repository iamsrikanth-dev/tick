/** Links back to MetricDeck, tagged so its analytics can attribute visits to Tick. */
export function metricDeckUrl(placement: string): string {
  const params = new URLSearchParams({
    utm_source: 'tickcodes',
    utm_medium: 'referral',
    utm_campaign: 'free_tool',
    utm_content: placement,
  });
  return `https://metricdeck.app/?${params}`;
}
