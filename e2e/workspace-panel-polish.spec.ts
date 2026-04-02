import { expect, Page, test } from "@playwright/test";

function uniqueName(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function openWorkspace(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("new-project-button")).toBeVisible({ timeout: 45_000 });
}

async function createProjectViaUi(page: Page, projectName: string) {
  await page.getByTestId("new-project-button").click();
  await expect(page.getByTestId("project-name-input")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("project-name-input").fill(projectName);
  await page.getByTestId("create-project-button").click();
  await expect(page.getByRole("button", { name: projectName, exact: true })).toBeVisible({ timeout: 20_000 });
}

async function createSessionViaUi(page: Page, projectName: string, sessionName: string) {
  await page.locator(`[data-testid="new-session-button"][data-project-name="${projectName}"]`).click();
  await expect(page.getByTestId("session-name-input")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("session-name-input").fill(sessionName);
  await page.getByTestId("create-session-button").click();
  await expect(page.getByTestId("active-session-label")).toHaveValue(sessionName, { timeout: 20_000 });
}

async function openPanelViaUi(page: Page, kind: "files" | "terminal" | "browser") {
  await page.getByTestId("new-panel-button").click();
  await page.getByTestId(`new-panel-option-${kind}`).click();
}

async function setProjectSandboxMode(page: Page, projectName: string, mode: "docker" | "host") {
  await page.evaluate(
    async ({ projectName: name, sandboxMode }) => {
      const runtime = (window as unknown as { bigIDE?: any }).bigIDE;
      if (!runtime) {
        throw new Error("bigIDE API is not available");
      }

      const projects = await runtime.projects.list();
      const project = projects.find((entry: { name: string; id: string }) => entry.name === name);
      if (!project) {
        throw new Error(`Project not found: ${name}`);
      }

      await runtime.projects.updateSandbox({
        projectId: project.id,
        sandbox: {
          mode: sandboxMode
        }
      });
    },
    {
      projectName,
      sandboxMode: mode
    }
  );
}

test("panel drag reorder still works after resize and horizontal scroll", async ({ page }) => {
  test.setTimeout(180_000);

  const projectName = uniqueName("workspace-panel-project");
  const sessionName = uniqueName("workspace-panel-session");

  await openWorkspace(page);
  await createProjectViaUi(page, projectName);
  await createSessionViaUi(page, projectName, sessionName);
  await setProjectSandboxMode(page, projectName, "host");

  const sessionRow = page.locator(`[data-testid="session-row"][data-session-name="${sessionName}"]`);
  await page.getByTestId("start-session-button").click();
  await expect(sessionRow).toHaveAttribute("data-session-status", "running", { timeout: 60_000 });

  await openPanelViaUi(page, "files");
  await openPanelViaUi(page, "browser");
  await openPanelViaUi(page, "terminal");

  const scrollRegion = page.getByTestId("session-panel-scroll-region");
  const filesPanel = page.locator("[data-testid='session-panel'][data-panel-id='files']").first();
  const browserPanel = page.locator("[data-testid='session-panel'][data-panel-id='browser']").first();
  const resizeHandle = filesPanel.locator('[data-panel-resize-handle="true"]');

  const handleBox = await resizeHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  if (!handleBox) {
    throw new Error("Resize handle did not have a bounding box");
  }

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 140, handleBox.y + handleBox.height / 2, { steps: 12 });
  await page.mouse.up();

  await scrollRegion.evaluate((node) => {
    node.scrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
  });
  await scrollRegion.evaluate((node) => {
    node.scrollLeft = Math.max(0, node.scrollLeft - 220);
  });

  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await browserPanel.dispatchEvent("dragstart", { dataTransfer });
  await filesPanel.dispatchEvent("dragenter", { dataTransfer });
  await filesPanel.dispatchEvent("dragover", { dataTransfer });
  await filesPanel.dispatchEvent("drop", { dataTransfer });
  await browserPanel.dispatchEvent("dragend", { dataTransfer });

  const order = await page.locator("[data-testid='session-panel']").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-panel-id") ?? "")
  );

  expect(order.indexOf("browser")).toBeLessThan(order.indexOf("files"));
});
