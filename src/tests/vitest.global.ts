export async function setup(): Promise<void> {
  console.log("vitest globalSetup");
  // Global setup logic can go here if needed
}

export async function teardown(): Promise<void> {
  console.log("vitest globalTeardown");
  // Global teardown logic can go here if needed
}
