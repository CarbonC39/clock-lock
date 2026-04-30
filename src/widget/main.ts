import { createApp } from "vue";
import { createPinia } from "pinia";
import WidgetWindow from "./WidgetWindow.vue";

const app = createApp(WidgetWindow);
app.use(createPinia());
app.mount("#app");
