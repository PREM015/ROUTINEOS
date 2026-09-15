export default function AppearanceSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Appearance</h1>
        <p className="text-muted-foreground mt-2">Customize how RoutineOS looks.</p>
      </div>

      <div className="bg-card border rounded-xl p-6 space-y-6">
        <div>
          <h3 className="font-medium mb-3">Theme</h3>
          <div className="flex gap-4">
            <label className="flex items-center gap-2"><input type="radio" name="theme" /> Light</label>
            <label className="flex items-center gap-2"><input type="radio" name="theme" defaultChecked /> Dark</label>
            <label className="flex items-center gap-2"><input type="radio" name="theme" /> System</label>
          </div>
        </div>

        <div>
          <h3 className="font-medium mb-3">Layout</h3>
          <label className="flex items-center gap-2">
            <input type="checkbox" /> Compact Mode
          </label>
        </div>

        <div>
          <h3 className="font-medium mb-3">Animations</h3>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked /> Enable UI Animations
          </label>
        </div>

        <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md">Save Preferences</button>
      </div>
    </div>
  );
}
