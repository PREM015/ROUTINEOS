export default function NotificationsSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-muted-foreground mt-2">Manage your email and push notifications.</p>
      </div>

      <div className="bg-card border rounded-xl p-6 space-y-4">
        <label className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
          <div>
            <div className="font-medium">Daily Reminder</div>
            <div className="text-sm text-muted-foreground">Get reminded to log your habits</div>
          </div>
          <input type="checkbox" defaultChecked className="w-5 h-5" />
        </label>
        
        <label className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
          <div>
            <div className="font-medium">Weekly Recap</div>
            <div className="text-sm text-muted-foreground">Receive a summary of your week</div>
          </div>
          <input type="checkbox" defaultChecked className="w-5 h-5" />
        </label>
      </div>
    </div>
  );
}
