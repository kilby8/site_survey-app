// ============================================================
// Editing state for one survey. Every change is saved to SQLite
// (debounced 400 ms, and immediately when the app goes to background
// or the screen closes), so a killed app resumes exactly where it was.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { AnswerValue } from "./blueprint";
import { markAnswerDirty, mergeServerAnswers, onCrewAnswers } from "./installJob";
import { nextPlaneId, planeSeqAfter, type CapturedPhoto, type SurveyDoc } from "./model";
import { loadPhotos, loadSurvey, removePhoto, saveDoc, type StoredSurvey } from "./repo";

export type SaveState = "saved" | "saving" | "error";

export function useSurveyEditor(surveyId: string) {
  const [survey, setSurvey] = useState<StoredSurvey | null>(null);
  const [doc, setDoc] = useState<SurveyDoc | null>(null);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [step, setStepState] = useState<StoredSurvey["currentStep"]>("project_arrival");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [notFound, setNotFound] = useState(false);

  const docRef = useRef<SurveyDoc | null>(null);
  const stepRef = useRef<StoredSurvey["currentStep"]>("project_arrival");
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const loaded = await loadSurvey(surveyId);
      if (!alive) return;
      if (!loaded) {
        setNotFound(true);
        return;
      }
      docRef.current = loaded.survey.doc;
      stepRef.current = loaded.survey.currentStep;
      // Step and photos before the doc: on the old architecture these updates
      // aren't batched after an await, and the screen renders as soon as the
      // doc is set, so the doc must arrive with its own step already in place.
      setStepState(loaded.survey.currentStep === "review" ? "review" : loaded.survey.currentStep);
      setPhotos(loaded.photos);
      setSurvey(loaded.survey);
      setDoc(loaded.survey.doc);
    })();
    return () => {
      alive = false;
    };
  }, [surveyId]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current || !docRef.current) return;
    dirty.current = false;
    setSaveState("saving");
    try {
      await saveDoc(surveyId, docRef.current, stepRef.current);
      setSaveState(dirty.current ? "saving" : "saved");
    } catch {
      dirty.current = true;
      setSaveState("error");
    }
  }, [surveyId]);

  const schedule = useCallback(() => {
    dirty.current = true;
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 400);
  }, [flush]);

  // Save right away when the app is backgrounded or the screen goes away.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") void flush();
    });
    return () => {
      sub.remove();
      void flush();
    };
  }, [flush]);

  const update = useCallback(
    (fn: (d: SurveyDoc) => SurveyDoc) => {
      if (!docRef.current) return;
      const next = fn(docRef.current);
      docRef.current = next;
      setDoc(next);
      schedule();
    },
    [schedule],
  );

  const setAnswer = useCallback(
    (fieldId: string, value: AnswerValue, planeId: string | null = null) =>
      update((d) =>
        planeId
          ? {
              ...d,
              planes: d.planes.map((p) => (p.id === planeId ? { ...p, answers: { ...p.answers, [fieldId]: value } } : p)),
            }
          : d.kind === "install"
            ? markAnswerDirty({ ...d, answers: { ...d.answers, [fieldId]: value } }, fieldId)
            : { ...d, answers: { ...d.answers, [fieldId]: value } },
      ),
    [update],
  );

  // Install jobs: answers a crew mate entered arrive from sync.
  useEffect(
    () =>
      onCrewAnswers((jobId, answers, finished) => {
        if (jobId !== surveyId || !docRef.current) return;
        let next = mergeServerAnswers(docRef.current, answers);
        if (finished) next = { ...next, extra: { ...next.extra, finished: { ...finished, ...((next.extra?.finished as Record<string, string>) ?? {}) } } };
        docRef.current = next;
        setDoc(next);
      }),
    [surveyId],
  );

  const addPlane = useCallback(() => {
    let id = "";
    update((d) => {
      id = nextPlaneId(d);
      return { ...d, planes: [...d.planes, { id, answers: {} }], planeSeq: Math.max(d.planeSeq ?? 0, planeSeqAfter(id)) };
    });
    return id;
  }, [update]);

  /** Remove a plane, its skip reasons and its photos. */
  const removePlane = useCallback(
    async (planeId: string) => {
      update((d) => ({
        ...d,
        planes: d.planes.filter((p) => p.id !== planeId),
        planeSeq: Math.max(d.planeSeq ?? 0, d.planes.length),
        overrides: d.overrides.filter((o) => !o.key.startsWith(`${planeId}:`) && !o.key.startsWith(`field:${planeId}:`)),
      }));
      const current = await loadPhotos(surveyId);
      for (const p of current.filter((x) => x.planeId === planeId)) await removePhoto(p);
      setPhotos(await loadPhotos(surveyId));
    },
    [update, surveyId],
  );

  const setOverride = useCallback(
    (key: string, reason: string | null) =>
      update((d) => ({
        ...d,
        overrides: reason
          ? [...d.overrides.filter((o) => o.key !== key), { key, reason, at: new Date().toISOString() }]
          : d.overrides.filter((o) => o.key !== key),
      })),
    [update],
  );

  const setNotes = useCallback((notes: string) => update((d) => ({ ...d, notes })), [update]);
  const setExtra = useCallback((key: string, value: unknown) => update((d) => ({ ...d, extra: { ...d.extra, [key]: value } })), [update]);

  const setGps = useCallback((gps: SurveyDoc["gps"]) => update((d) => ({ ...d, gps })), [update]);

  const setStep = useCallback(
    (s: StoredSurvey["currentStep"]) => {
      stepRef.current = s;
      setStepState(s);
      dirty.current = true;
      void flush();
    },
    [flush],
  );

  const reloadPhotos = useCallback(async () => {
    setPhotos(await loadPhotos(surveyId));
  }, [surveyId]);

  return {
    survey,
    doc,
    photos,
    step,
    saveState,
    notFound,
    setAnswer,
    addPlane,
    removePlane,
    setOverride,
    setNotes,
    setExtra,
    setGps,
    setStep,
    setPhotos,
    reloadPhotos,
    flush,
  };
}
