export default function DataSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Data Management</h1>
        <p className="text-muted-foreground mt-2">Export or import your RoutineOS data.</p>
      </div>

      <div className="bg-card border rounded-xl p-6 space-y-6">
        <div>
          <h3 className="font-medium mb-2">Export Data</h3>
          <p className="text-sm text-muted-foreground mb-4">Download all your habits, routines, and logs in JSON format.</p>
          <button className="px-4 py-2 border border-primary text-primary rounded-md hover:bg-primary/10">Export JSON</button>
        </div>
        
        <div className="border-t pt-6">
          <h3 className="font-medium mb-2">Import Data</h3>
          <p className="text-sm text-muted-foreground mb-4">Restore from a previous backup. This will merge with existing data.</p>
          <input type="file" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" />
        </div>
      </div>
    </div>
  );
}
