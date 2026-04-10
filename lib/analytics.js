import { getWeekKey } from './utils';

export const Analytics = {
  userId: () => {
    let id = localStorage.getItem("aster_uid");
    if (!id) {
      id = "anon_" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("aster_uid", id);
    }
    return id;
  },
  track: (event, meta = {}) => {
    try {
      const events = JSON.parse(localStorage.getItem("aster_events") || "[]");
      if (!Array.isArray(events)) return;
      events.push({ event, userId: Analytics.userId(), ts: new Date().toISOString(), week: getWeekKey(), ...meta });
      localStorage.setItem("aster_events", JSON.stringify(events.slice(-500)));
    } catch {}
  },
  getWeeklyRollup: () => {
    let events;
    try { events = JSON.parse(localStorage.getItem("aster_events") || "[]"); } catch { events = []; }
    if (!Array.isArray(events)) events = [];
    const byWeek = {};
    events.forEach(e => {
      const w = e.week || getWeekKey(e.ts);
      if (!byWeek[w]) byWeek[w] = { week: w, users: new Set(), resumes: 0, jds: 0, fitScores: 0, outreach: 0, emailCaptures: 0 };
      byWeek[w].users.add(e.userId);
      if (e.event === "resume_upload") byWeek[w].resumes++;
      if (e.event === "jd_analyzed") byWeek[w].jds++;
      if (e.event === "fit_score_generated") byWeek[w].fitScores++;
      if (e.event === "outreach_generated") byWeek[w].outreach++;
      if (e.event === "email_captured") byWeek[w].emailCaptures++;
    });
    return Object.values(byWeek).map(w => ({ ...w, wau: w.users.size, users: undefined })).sort((a, b) => b.week.localeCompare(a.week));
  },
};
