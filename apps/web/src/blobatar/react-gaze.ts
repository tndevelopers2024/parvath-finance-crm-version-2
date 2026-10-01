/**
 * `useGaze` — the pointer-driven gaze layer (§4.5), as a hook.
 *
 * ## Why this is a subpath and not a prop on `<Blobatar>`
 *
 * A prop would put `blobatar/gaze` in this package's import graph for everyone.
 * The adapter is 76 B of its own code and the driver is 1.2 kB, so every
 * consumer rendering static avatars in a list would start paying for a pointer
 * driver they never run. That is the same trade the rest of the library makes
 * everywhere it can: expressions are values you import rather than strings you
 * pass, `motion.css` is a file you choose to load, and `gaze.css` is a second
 * one. `@blobatar/react-native/animated` is this exact shape already.
 *
 * The gate that keeps it honest is `@blobatar/react alone` in
 * `packages/harness/scripts/size.ts`, budgeted at 110 B. Importing this module
 * from `index.tsx` would blow it immediately, which is the point.
 *
 * A prop would also not have saved you anything. Two of the three steps stay
 * whatever the API looks like: `import "blobatar/gaze.css"`, and setting
 * `--mo-track-travel` on the blobatars that should follow the pointer, which is
 * what opts them in. A prop would have been the third of three while looking
 * like the only one, and the failure mode of getting it wrong is a face that
 * renders perfectly and never moves.
 *
 * ## What this actually removes
 *
 * The ref, the effect, the teardown, and the handle-in-a-ref that any caller
 * wanting `lookAt` has to keep. That last one is a trap rather than a chore:
 * the driver holds the eyes' current position, so rebuilding it to change where
 * it points snaps them to centre. A component that recreated it on each
 * keystroke would have eyes that jump between every pair of letters.
 *
 * ```tsx
 * import { Blobatar } from "@blobatar/react";
 * import { useGaze } from "@blobatar/react/gaze";
 * import "blobatar/motion.css";
 * import "blobatar/gaze.css";
 *
 * const { ref } = useGaze({ travel: 3 });
 * <Blobatar ref={ref} name={user.email} animate="always" size={200} />;
 * ```
 *
 * `travel` is the excursion, and it is what opts a blobatar in. Leave it out
 * and the stylesheet owns it instead, which is the better route for a whole
 * field of blobatars or for anything responsive:
 *
 * ```css
 * .hero .mo-eyes { --mo-track-travel: 3px; }
 * ```
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { gaze, type Gaze, type GazeOptions, type GazeTarget } from "./gaze";

export type { GazeTarget };

/**
 * The driver's tuning, plus where to look.
 *
 * `GazeOptions.target` is not forwarded under its own name, and the difference
 * is not cosmetic. On the driver it is construction-time sugar: it aims the
 * driver as it is built and is never read again. A construction-time option
 * that looks declarative is the classic React trap — passing `target={point}`
 * and watching it do nothing on the second render — so what this hook takes
 * instead is `lookAt`, which is applied *whenever it changes* and is therefore
 * the declarative thing it looks like.
 */
export type UseGazeOptions = Pick<GazeOptions, "settle" | "snap"> & {
  /**
   * Where to look, declaratively. Omit it and the eyes are yours to aim with
   * the returned `lookAt`.
   *
   * This is the whole integration for a page whose answer does not change:
   *
   * ```tsx
   * const { ref } = useGaze({ travel: 3, lookAt: "pointer" });
   * ```
   *
   * It takes the same `GazeTarget` union as the function, and it is re-applied
   * whenever it changes rather than only on mount — including on the render
   * where the blobatar first appears, so there is no window in which a
   * declared target has not been asked for yet. A point is compared by its
   * coordinates rather than by identity, so an inline `{ x, y }` re-aims when
   * the numbers move and not merely because the object is new.
   *
   * **Omitted and `null` are different.** Omitted means "I will aim this
   * myself", and the hook then never writes over what your `lookAt` calls have
   * asked for. `null` is a target like any other: look at nothing. A component
   * that passes `lookAt={cond ? "pointer" : null}` is declaring both, which is
   * the point of the distinction.
   *
   * Do not drive a caret through this. A target that changes on every keystroke
   * is a render per keystroke to say something the driver could have been told
   * directly; the function is the seam for that, and the two mix — the last
   * thing asked for wins, whichever asked.
   */
  lookAt?: GazeTarget;
  /**
   * The excursion, in viewBox units. Omit and the stylesheet owns it.
   *
   * This is what opts a blobatar into the layer at all: `--mo-track-travel` is
   * registered with an initial value of `0px`, so a page that loads
   * `blobatar/gaze.css` and sets it nowhere has a driver running and no eyes
   * moving. That is the layer's likeliest failure, and its cause is a CSS
   * property rather than anything visible from here, which is the argument for
   * the option existing.
   *
   * **A rule on `.mo-eyes` beats this, not the other way round.** The hook
   * writes an inline custom property on the element you attach the ref to,
   * which is the `<svg>`, and the property reaches the eyes by inheriting down
   * to the `.mo-eyes` group that `gaze.css` reads it on. A selector matching
   * that group directly — `.something .mo-eyes { --mo-track-travel: … }` — is a
   * declaration on the element itself, and that always wins over an inherited
   * value however the ancestor's was written. Inline only outranks a selector
   * on the *same* element. So do not set both: the rule wins, `travel` does
   * nothing, and the symptom is a face that renders perfectly and never moves.
   * Setting it on an ancestor, or on the host the ref is on, is inheritance
   * against inheritance and the inline value wins there as expected.
   *
   * There is no default for the same reason: leave it out and the two can never
   * collide, because the hook writes nothing.
   *
   * CSS keeps three things this cannot do, so it is the better route whenever
   * one of them applies: setting the excursion on *many* blobatars from one
   * ancestor, since the property inherits; making it responsive through a media
   * or container query; and keeping the geometry beside the rest of a
   * component's geometry. The option is a convenience for the single-blobatar
   * case, not a replacement for the property.
   *
   * The scale: the blobatar is 100 units across, so `3` is 3% of the face, not
   * three screen pixels. The idle glance's widest stop is a median 1.4 units,
   * so the range worth trying is about 1.5 to 4, and the ceiling is the eyes
   * crossing the silhouette — which `motion.css` is explicit is allowed and
   * reads as a face turning on a round head.
   */
  travel?: number;
};

export interface UseGazeResult {
  /**
   * Attach to the `<Blobatar>`. A callback ref, not an object one.
   *
   * It takes the `<img>` of a static blobatar as well as the `<svg>` of an
   * animated one, because `animate` is the caller's to change and a ref that
   * stopped type-checking when it went off would make toggling animation a
   * compile error. The layer is simply inert there: an `<img>` has no eyes.
   *
   * The driver's life then follows the element's exactly, which an object ref
   * cannot express: a blobatar that is conditionally rendered, or swapped for
   * something else, mounts and unmounts without anything in a dependency array
   * changing, so an effect keyed on options alone would hold a driver pointed
   * at a detached node. React calls this with the element and with `null`, so
   * there is nothing to key on and nothing to remember to key on.
   */
  ref: (node: SVGSVGElement | HTMLImageElement | null) => void;
  /**
   * Point the eyes at something: a point in client coordinates, an element,
   * `"pointer"`, `"rest"`, or `null` for nothing. See `GazeTarget`.
   *
   * **A blobatar looks at nothing until this is called**, `"pointer"` included:
   * a driver is armed by mounting and aimed by asking. One line in an effect is
   * the cursor-following blobatar most pages are after:
   *
   * ```tsx
   * const { ref, lookAt } = useGaze({ travel: 3 });
   * useEffect(() => lookAt("pointer"), [lookAt]);
   * ```
   *
   * A ref works wherever an element does — `lookAt(button.current)` — because
   * the union takes the element itself and a ref's `.current` is one. There is
   * deliberately no ref member: a ref is a box React fills in later, and a
   * driver holding the box rather than what came out of it would be reading
   * `null` on the first frame after mount and every frame after a swap.
   *
   * Stable for the life of the component, so it is safe in a dependency array
   * and safe to hand to a child — and the effect above is exactly why it has to
   * be: a `lookAt` that changed identity would re-aim on every render.
   *
   * Calling it before the blobatar has mounted is a queued request rather than
   * a no-op. The target is remembered and handed to the driver the moment there
   * is one, which is what makes the effect above work at all: it runs a render
   * before the driver exists, and it never runs again.
   */
  lookAt: (t: GazeTarget) => void;
  /**
   * Re-measure the box.
   *
   * Scroll, resize and the element's own resizes are already watched. This is
   * for a host that moved it some other way, or that knows the layout settled
   * before any observer will say so.
   */
  remeasure: () => void;
}

export function useGaze({
  settle,
  snap,
  travel,
  lookAt: declared,
}: UseGazeOptions = {}): UseGazeResult {
  /*
   * State rather than a ref, and it is what makes the callback ref above work.
   * A ref assignment does not re-render, so an effect could never see the
   * element arrive; setting state does, and the effect below then runs with a
   * `node` that is either the mounted element or `null`. One extra render on
   * mount, which is the standard cost of measuring a node in React.
   */
  const [node, setNode] = useState<SVGSVGElement | HTMLImageElement | null>(null);
  const driver = useRef<Gaze | null>(null);

  /**
   * The last target asked for, held so that it survives not having a driver
   * yet.
   *
   * A driver is built in an effect, and an effect runs after the ref it depends
   * on has landed — which is one render later, because the callback ref sets
   * state. So a consumer's own `useEffect(() => lookAt("pointer"), [lookAt])`
   * fires on the render *before* the driver exists, and against a bare
   * `driver.current?.lookAt(…)` it does nothing at all. Its dependencies have
   * not changed by the time the driver arrives, so it never fires again either,
   * and the eyes simply never move.
   *
   * That is the trap the driver's `null` default would otherwise set for every
   * consumer at once, since aiming is now something every consumer does. So
   * `lookAt` records the intent whether or not there is anything to carry it
   * out, and the effect below hands it to each driver it builds. Aiming before
   * mount is a queued request rather than a silent no-op.
   *
   * It is also what makes the driver survive being rebuilt. `settle` and `snap`
   * changing constructs a new driver, and a new driver is aimed at `null`:
   * without this, retuning the pursuit would quietly stop the gaze.
   */
  const target = useRef<GazeTarget>(null);

  /*
   * `settle` and `snap` are primitives, so an inline `useGaze({ settle: 90 })`
   * does not rebuild the driver on every render the way an object identity in
   * this list would. Changing either does rebuild it, and that resets the eyes
   * to centre — correct, since a new time constant is a different filter and
   * carrying the old one's state into it would be neither.
   */
  useEffect(() => {
    /*
     * The `instanceof` is not defensive typing. `animate` is the caller's to
     * change, and with it off `<Blobatar>` renders an `<img>` — which has no
     * `.mo-eyes`, no stylesheet reaching inside it and no eyes. A driver built
     * on one measures a box, attaches its listeners and runs a frame loop
     * forever for a picture that cannot move, which is invisible in every way
     * except the battery. Caught by `no driver on a static blobatar` in
     * `packages/harness/scripts/probe-gaze.ts`.
     */
    if (!node || !(node instanceof SVGSVGElement)) return;
    const g = gaze(node, { settle, snap, target: target.current });
    driver.current = g;
    return () => {
      driver.current = null;
      g.stop();
    };
  }, [node, settle, snap]);

  /*
   * Declared after the driver's effect on purpose. Effects run in declaration
   * order, so on mount the driver exists by the time this writes the property,
   * and the `remeasure` below is what stops the threshold being derived from
   * the `0px` that was there a moment earlier.
   *
   * Separate from that effect rather than folded into it, which would be
   * shorter and wrong: `travel` in the driver's dependency list would rebuild
   * the driver whenever it changed, and a new driver starts with the eyes at
   * centre. Changing how far a blobatar looks should not make it stop looking.
   *
   * The cleanup removes the property rather than restoring a previous value.
   * There is nothing to restore: the hook only ever wrote it if `travel` was
   * given, so removing it hands the element back to whatever the stylesheet
   * says, which is exactly where it would have been.
   */
  useEffect(() => {
    if (!node || travel === undefined) return;
    node.style.setProperty("--mo-track-travel", `${travel}px`);
    /* The excursion itself is pure CSS and applies on the next frame. This is
       for the driver's write threshold, which is derived from the value and
       cached at measure time, so without it a change leaves writes stopping
       slightly early or late until the next scroll or resize. */
    driver.current?.remeasure();
    return () => {
      /* A block, not a concise body: `removeProperty` returns the old value,
         and a cleanup that returns a string is not a `Destructor`. */
      node.style.removeProperty("--mo-track-travel");
    };
  }, [node, travel]);

  const lookAt = useCallback((t: GazeTarget) => {
    target.current = t;
    driver.current?.lookAt(t);
  }, []);

  /*
   * The declared target, applied on mount and on every change.
   *
   * Keyed on a value rather than on the target itself, because a point is the
   * one member of the union a caller writes inline: `lookAt={{ x, y }}` is a
   * new object on every render, and keying on identity would re-aim the driver
   * every time the component rendered for any reason at all. An element and the
   * two words are already stable by identity, so the key is simply themselves.
   *
   * `undefined` is not a target: it is the caller saying they will aim it, and
   * this stays out of their way entirely rather than aiming at `null` on their
   * behalf.
   */
  const key =
    declared && typeof declared === "object" && "x" in declared
      ? `${declared.x},${declared.y}`
      : declared;

  useEffect(() => {
    if (declared !== undefined) lookAt(declared);
    /* `declared` is deliberately not a dependency: `key` is its value, and the
       object identity it would add is the churn this is built to avoid. */
  }, [lookAt, key]);

  const remeasure = useCallback(() => {
    driver.current?.remeasure();
  }, []);

  return { ref: setNode, lookAt, remeasure };
}
