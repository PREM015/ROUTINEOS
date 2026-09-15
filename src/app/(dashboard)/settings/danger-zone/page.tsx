export default function DangerZonePage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-destructive">Danger Zone</h1>
        <p className="text-muted-foreground mt-2">Irreversible account actions.</p>
      </div>

      <div className="border border-destructive/50 rounded-xl p-6 space-y-4 bg-destructive/5">
        <h3 className="font-medium text-destructive">Delete Account</h3>
        <p className="text-sm text-muted-foreground">
          Once you delete your account, there is no going back. Please be certain.
        </p>
        <button className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md font-medium hover:bg-destructive/90">
          Delete My Account
        </button>
      </div>
    </div>
  );
}
