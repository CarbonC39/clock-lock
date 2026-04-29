import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "workspace",
      component: () => import("../pages/WorkspacePage.vue"),
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("../pages/SettingsPage.vue"),
    },
  ],
});

export default router;
