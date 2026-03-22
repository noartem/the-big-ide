import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, Page, test } from "@playwright/test";

function uniqueName(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function openWorkspace(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("project-name-input")).toBeVisible({ timeout: 45_000 });
}

async function createProjectAndSessionViaUi(page: Page, projectName: string, sessionName: string) {
  await page.getByTestId("project-name-input").fill(projectName);
  await page.getByTestId("create-project-button").click();
  await expect(page.getByRole("button", { name: projectName, exact: true })).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("session-name-input").fill(sessionName);
  await page.getByTestId("create-session-button").click();
  await expect(page.getByTestId("active-session-label")).toContainText(`Session: ${sessionName}`, { timeout: 20_000 });
}

async function setProjectSandboxMode(page: Page, projectName: string, mode: "docker" | "host") {
  await page.evaluate(async ({ projectName: name, sandboxMode }) => {
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
  }, {
    projectName,
    sandboxMode: mode
  });
}

function createGitFixtureRepo() {
  const repoRoot = mkdtempSync(join(tmpdir(), "big-ide-e2e-"));
  writeFileSync(join(repoRoot, "README.md"), "# Playwright fixture\n");

  execFileSync("git", ["init", "--initial-branch=main"], { cwd: repoRoot, stdio: "pipe" });
  execFileSync("git", ["config", "user.name", "Playwright"], { cwd: repoRoot, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "playwright@example.com"], { cwd: repoRoot, stdio: "pipe" });
  execFileSync("git", ["add", "."], { cwd: repoRoot, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "chore: init fixture"], { cwd: repoRoot, stdio: "pipe" });

  return repoRoot;
}

test.describe("usage recordings", () => {
  test.setTimeout(180_000);

  test("session lifecycle from UI", async ({ page }) => {
    const projectName = uniqueName("ui-project");
    const sessionName = uniqueName("ui-session");

    await openWorkspace(page);
    await createProjectAndSessionViaUi(page, projectName, sessionName);
    await setProjectSandboxMode(page, projectName, "host");

    const sessionRow = page.locator(`[data-testid="session-row"][data-session-name="${sessionName}"]`);
    await expect(sessionRow).toHaveAttribute("data-session-status", "idle");

    await page.getByTestId("start-session-button").click();
    await expect(sessionRow).toHaveAttribute("data-session-status", "running", { timeout: 60_000 });

    await page.getByTestId("stop-session-button").click();
    await expect(sessionRow).toHaveAttribute("data-session-status", "idle", { timeout: 40_000 });
  });

  test("live git and web panel flow", async ({ page }) => {
    const projectName = uniqueName("git-project");
    const sessionName = uniqueName("git-session");
    const fileName = `${uniqueName("playwright-change")}.txt`;
    const fixtureRepo = createGitFixtureRepo();

    try {
      await openWorkspace(page);

      const sessionWorkdir = await page.evaluate(async ({ projectName: name, sessionName: session, rootPath }) => {
        const runtime = (window as unknown as { bigIDE?: any }).bigIDE;
        if (!runtime) {
          throw new Error("bigIDE API is not available");
        }

        const project = await runtime.projects.create({
          name,
          rootPath
        });

        const createdSession = await runtime.sessions.create({
          projectId: project.id,
          name: session
        });

        return createdSession.workdir;
      }, {
        projectName,
        sessionName,
        rootPath: fixtureRepo
      });

      await page.getByRole("button", { name: projectName, exact: true }).click();
      const sessionRow = page.locator(`[data-testid="session-row"][data-session-name="${sessionName}"]`);
      await sessionRow.click();
      await expect(page.getByTestId("active-session-label")).toContainText(`Session: ${sessionName}`);

      await page.evaluate(async ({ workdir, fileName: dirtyFile }) => {
        const runtime = (window as unknown as { bigIDE?: any }).bigIDE;
        if (!runtime) {
          throw new Error("bigIDE API is not available");
        }

        await runtime.fs.writeFile({
          filePath: `${workdir}/${dirtyFile}`,
          content: `playwright update ${Date.now()}\n`
        });
      }, {
        workdir: sessionWorkdir,
        fileName
      });

      await page.getByTestId("refresh-git-button").click();

      const gitRow = page.locator("[data-testid='git-file-row']", { hasText: fileName });
      await expect(gitRow).toBeVisible({ timeout: 20_000 });
      await gitRow.click();

      await expect(page.getByTestId("git-stage-button")).toBeEnabled();
      await page.getByTestId("git-stage-button").click();
      await expect(page.getByTestId("git-commit-button")).toBeEnabled({ timeout: 15_000 });

      await page.getByTestId("git-discard-button").click();
      await expect(gitRow).toHaveCount(0, { timeout: 20_000 });

      const healthUrl = "http://127.0.0.1:43111/api/health";
      await page.getByTestId("web-url-input").fill(healthUrl);
      await page.getByTestId("web-open-button").click();

      await expect(page.getByTestId("web-iframe")).toHaveAttribute("src", healthUrl, { timeout: 15_000 });
      await expect(page.getByTestId("web-status")).toContainText("status: loaded", { timeout: 20_000 });
    } finally {
      rmSync(fixtureRepo, { recursive: true, force: true });
    }
  });
});
