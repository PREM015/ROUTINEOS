export default function ProfileSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profile Settings</h1>
        <p className="text-muted-foreground mt-2">Update your personal information.</p>
      </div>

      <div className="bg-card border rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Display Name</label>
          <input type="text" className="w-full p-2 border rounded-md bg-background" placeholder="Your name" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Bio</label>
          <textarea className="w-full p-2 border rounded-md bg-background" rows={3} placeholder="A short bio"></textarea>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Avatar URL</label>
          <input type="url" className="w-full p-2 border rounded-md bg-background" placeholder="https://" />
        </div>
        <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md">Save Changes</button>
      </div>
    </div>
  );
}
