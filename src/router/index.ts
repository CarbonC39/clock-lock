import { createRouter, createWebHistory } from "vue-router";
import WorkspacePage from "../pages/WorkspacePage.vue";
import SettingsPage from "../pages/SettingsPage.vue";

// Eager imports: a desktop app has no need for lazy route chunks, and loading
// them with the main bundle avoids a startup race where the initial navigation's
// dynamic import can fail (leaving RouterView empty) before vite has warmed up.
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "workspace",
      component: WorkspacePage,
    },
    {
      path: "/settings",
      name: "settings",
      component: SettingsPage,
    },
  ],
});

export default router;
