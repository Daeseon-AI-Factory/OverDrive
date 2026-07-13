const { patchSwiftAppDelegate } = require('./withReploomIosCompliance');

const appDelegate = `class AppDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    return true
  }

  // Linking API
}
`;

describe('withReploomIosCompliance', () => {
  it('protects both the SQLite directory and existing database sidecars before launch', () => {
    const patched = patchSwiftAppDelegate(appDelegate);

    expect(patched).toContain('protectLocalDatabaseFromBackup()');
    expect(patched).toContain('contentsOfDirectory(');
    expect(patched).toContain('for item in [sqliteDirectory] + existingFiles');
    expect(patched).toContain('FileProtectionType.complete');
    expect(patched).toContain('values.isExcludedFromBackup = true');
  });

  it('is idempotent when prebuild applies the plugin again', () => {
    const once = patchSwiftAppDelegate(appDelegate);
    const twice = patchSwiftAppDelegate(once);

    expect(twice).toBe(once);
  });
});
