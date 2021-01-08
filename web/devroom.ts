import { MatrixCapabilities, WidgetApi } from "matrix-widget-api";

const el = document.createElement("div");
el.innerText = "Hello world";
document.body.appendChild(el);

// Example widget (to prove imports work)
const testWidget = new WidgetApi(/*widgetId*/);
testWidget.requestCapability(MatrixCapabilities.AlwaysOnScreen);
