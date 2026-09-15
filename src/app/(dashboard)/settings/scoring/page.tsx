export default function ScoringSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Scoring Weights</h1>
        <p className="text-muted-foreground mt-2">Adjust how different habit tiers affect your daily score.</p>
      </div>

      <div className="bg-card border rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1 flex justify-between">
            <span>Non-Negotiable</span>
            <span className="text-muted-foreground">3.0x</span>
          </label>
          <input type="range" min="1" max="5" step="0.5" defaultValue="3" className="w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 flex justify-between">
            <span>Growth</span>
            <span className="text-muted-foreground">2.0x</span>
          </label>
          <input type="range" min="1" max="5" step="0.5" defaultValue="2" className="w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 flex justify-between">
            <span>Maintenance</span>
            <span className="text-muted-foreground">1.0x</span>
          </label>
          <input type="range" min="0.5" max="3" step="0.5" defaultValue="1" className="w-full" />
        </div>
        
        <div className="pt-4 border-t mt-4">
          <p className="text-sm text-muted-foreground mb-4">Preview: With these settings, completing a Non-Negotiable habit is worth 3x as much as a Maintenance habit.</p>
          <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md">Save Weights</button>
        </div>
      </div>
    </div>
  );
}
