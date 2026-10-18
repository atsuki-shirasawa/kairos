// Drives the app the way a person does, for the end-to-end tests: finds controls in the
// accessibility tree by role and name (not by DOM structure, so the tests outlive a redesign),
// presses keys, clicks, and reads what the page shows. Runs on the captures' deterministic browser.
import type { Browser } from "../../scripts/screenshots/browser.ts";
import { waitFor } from "../../scripts/screenshots/wait.ts";

/** A control as the accessibility tree has it. */
export interface Control {
  role: string;
  name: string;
  /** Whether a toggle button is pressed; undefined for anything else. */
  pressed: boolean | undefined;
  /** The DOM node behind it, to click it or read its style. */
  backendNodeId: number;
}

/** How a test names a control: the whole name, a pattern, or a test on it. */
export type NameMatch = string | RegExp | ((name: string) => boolean);

interface AXValue {
  value?: unknown;
}
interface AXNode {
  nodeId: string;
  parentId?: string;
  ignored: boolean;
  role?: AXValue;
  name?: AXValue;
  properties?: { name: string; value: AXValue }[];
  backendDOMNodeId?: number;
}

/** Keys whose `KeyboardEvent.key` is a word, with the key code Chrome needs to dispatch them. */
const NAMED_KEYS: Record<string, number> = {
  Enter: 13,
  Escape: 27,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
};

/** The ⌘ (Meta) bit of a CDP key event's modifiers. */
const COMMAND = 4;

/** Handles the tests take on page objects go in this group, released after each call. */
const OBJECT_GROUP = "e2e";

/** The page under test. Every action waits for the page to settle before it returns. */
export class Page {
  constructor(private readonly browser: Browser) {}

  /** Opens `path` (`/journal/2026-10-01?view=day`) on the demo server. */
  open(path: string): Promise<void> {
    return this.browser.open(path);
  }

  /** Reloads the page. */
  reload(): Promise<void> {
    return this.browser.reload();
  }

  /**
   * Every control with `role` whose name matches, in document order; with `within`, only those
   * inside a landmark of that role ("main").
   */
  async all(role: string, name?: NameMatch, within?: string): Promise<Control[]> {
    const { nodes } = (await this.browser.send("Accessibility.getFullAXTree")) as {
      nodes: AXNode[];
    };
    const byId = new Map(nodes.map((n) => [n.nodeId, n]));
    return nodes
      .filter((n) => !n.ignored && n.backendDOMNodeId !== undefined)
      .filter((n) => within === undefined || hasAncestor(n, within, byId))
      .map(toControl)
      .filter((c) => c.role === role && (name === undefined || matches(c.name, name)));
  }

  /** The one control with `role` whose name matches; throws when there is none or several. */
  async get(role: string, name: NameMatch): Promise<Control> {
    const found = await this.all(role, name);
    if (found.length === 1 && found[0]) return found[0];
    const names = (await this.all(role)).map((c) => c.name);
    throw new Error(
      `expected one ${role} named ${String(name)}, found ${found.length}; the ${role}s are:\n  ${names.join("\n  ")}`,
    );
  }

  /** The control that has focus, or null when nothing does (focus is on the page's body). */
  async focused(): Promise<Control | null> {
    const backendNodeId = await this.focusedNode();
    if (backendNodeId === null) return null;
    const { nodes } = (await this.browser.send("Accessibility.getPartialAXTree", {
      backendNodeId,
      fetchRelatives: false,
    })) as { nodes: AXNode[] };
    const node = nodes[0];
    return node && !node.ignored ? toControl(node) : null;
  }

  /** The DOM node that has focus, or null when it is the body (or nothing). */
  private async focusedNode(): Promise<number | null> {
    const { result } = (await this.browser.send("Runtime.evaluate", {
      expression: "document.activeElement === document.body ? null : document.activeElement",
      objectGroup: OBJECT_GROUP,
    })) as { result: { objectId?: string } };
    try {
      if (!result.objectId) return null;
      const { node } = (await this.browser.send("DOM.describeNode", {
        objectId: result.objectId,
      })) as { node: { backendNodeId: number } };
      return node.backendNodeId;
    } finally {
      await this.releaseObjects();
    }
  }

  /** Presses a key ("j", "/", "Escape", "ArrowRight") on whatever has focus. */
  async press(key: string): Promise<void> {
    const code = NAMED_KEYS[key];
    const down =
      code === undefined
        ? { type: "keyDown", key, text: key }
        : { type: "rawKeyDown", key, code: key, windowsVirtualKeyCode: code };
    await this.browser.send("Input.dispatchKeyEvent", down);
    await this.browser.send("Input.dispatchKeyEvent", { type: "keyUp", key });
    await this.browser.settled();
  }

  /**
   * Presses a letter with ⌘ held ("k" for ⌘K). It types nothing, as with a real keyboard, and
   * goes to the page rather than the browser, which a headless run has no menus for anyway.
   */
  async pressWithCommand(letter: string): Promise<void> {
    const code = letter.toUpperCase().charCodeAt(0);
    const key = { key: letter, code: `Key${letter.toUpperCase()}`, windowsVirtualKeyCode: code };
    await this.browser.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      modifiers: COMMAND,
      ...key,
    });
    await this.browser.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      modifiers: COMMAND,
      ...key,
    });
    await this.browser.settled();
  }

  /** Types text into the focused field. */
  async type(text: string): Promise<void> {
    await this.browser.send("Input.insertText", { text });
    await this.browser.settled();
  }

  /** Clicks the middle of a control, after scrolling it into view. */
  async click(control: Control): Promise<void> {
    const { backendNodeId } = control;
    await this.browser.send("DOM.scrollIntoViewIfNeeded", { backendNodeId });
    const { model } = (await this.browser.send("DOM.getBoxModel", { backendNodeId })) as {
      model: { content: number[] };
    };
    const [x, y] = middle(model.content);
    for (const type of ["mousePressed", "mouseReleased"])
      await this.browser.send("Input.dispatchMouseEvent", {
        type,
        x,
        y,
        button: "left",
        clickCount: 1,
      });
    await this.browser.settled();
  }

  /**
   * How opaque a control looks: its own opacity times its ancestors', so it doesn't matter which
   * element the app fades.
   */
  async opacity(control: Control): Promise<number> {
    const value = await this.callOn(
      control,
      `function () {
        let opacity = 1;
        for (let el = this; el instanceof Element; el = el.parentElement)
          opacity *= Number(getComputedStyle(el).opacity);
        return opacity;
      }`,
    );
    return Number(value);
  }

  /** The tab's title. */
  title(): Promise<string> {
    return this.evaluate("document.title") as Promise<string>;
  }

  /** The path and query of the page's URL. */
  url(): Promise<string> {
    return this.evaluate("location.pathname + location.search") as Promise<string>;
  }

  /** Runs `expression` in the page, awaiting it if it is a promise, and returns its value. */
  async evaluate(expression: string): Promise<unknown> {
    const { result, exceptionDetails } = (await this.browser.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as { result: AXValue; exceptionDetails?: { text: string } };
    if (exceptionDetails) throw new Error(`in the page: ${exceptionDetails.text}`);
    return result.value;
  }

  /** Polls `check` until it holds, for what the page gets to on its own (server events). */
  eventually(what: string, check: () => Promise<boolean>): Promise<void> {
    return waitFor(what, check);
  }

  /** Calls `fn` with the control's DOM element as `this` and returns its value. */
  private async callOn(control: Control, fn: string): Promise<unknown> {
    try {
      const { object } = (await this.browser.send("DOM.resolveNode", {
        backendNodeId: control.backendNodeId,
        objectGroup: OBJECT_GROUP,
      })) as { object: { objectId: string } };
      const { result } = (await this.browser.send("Runtime.callFunctionOn", {
        objectId: object.objectId,
        functionDeclaration: fn,
        returnByValue: true,
      })) as { result: AXValue };
      return result.value;
    } finally {
      await this.releaseObjects();
    }
  }

  /** Lets the page free the handles the last call took, which would otherwise pile up. */
  private async releaseObjects(): Promise<void> {
    await this.browser.send("Runtime.releaseObjectGroup", { objectGroup: OBJECT_GROUP });
  }
}

/** Whether one of the node's ancestors has `role`. */
function hasAncestor(node: AXNode, role: string, byId: Map<string, AXNode>): boolean {
  for (let n = node.parentId ? byId.get(node.parentId) : undefined; n; ) {
    if (n.role?.value === role) return true;
    n = n.parentId ? byId.get(n.parentId) : undefined;
  }
  return false;
}

function toControl(node: AXNode): Control {
  const pressed = node.properties?.find((p) => p.name === "pressed")?.value.value;
  return {
    role: String(node.role?.value ?? ""),
    name: String(node.name?.value ?? ""),
    pressed: pressed === undefined ? undefined : pressed === true || pressed === "true",
    backendNodeId: node.backendDOMNodeId ?? 0,
  };
}

function matches(name: string, match: NameMatch): boolean {
  if (typeof match === "string") return name === match;
  if (match instanceof RegExp) return match.test(name);
  return match(name);
}

/** The middle of a box model's quad (x1, y1, …, x4, y4). */
function middle(quad: number[]): [number, number] {
  const xs = quad.filter((_, i) => i % 2 === 0);
  const ys = quad.filter((_, i) => i % 2 === 1);
  const mid = (v: number[]) => (Math.min(...v) + Math.max(...v)) / 2;
  return [mid(xs), mid(ys)];
}
