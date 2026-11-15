import Application from "./Application.js";

const app = new Application();
await app.initialize();
window.app = app;
