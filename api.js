const API_URL = "https://script.google.com/macros/s/AKfycbyX9nF5tnfuU0X9T9Fg1z4gGXeiQQ6e0BVn4uDocJH74bk5YJElw3NpSjmRniVH5n_K/exec";

function jsonpRequest(params) {
  return new Promise((resolve, reject) => {
    const callbackName = "pgCallback_" + Date.now();

    params.callback = callbackName;
    params.cachebuster = Date.now();

    const query = new URLSearchParams(params).toString();
    const script = document.createElement("script");

    window[callbackName] = function(data) {
      delete window[callbackName];
      script.remove();
      resolve(data);
    };

    script.onerror = function() {
      delete window[callbackName];
      script.remove();
      reject(new Error("API skripts neielādējās. Pārbaudi API_URL vai deployment piekļuvi."));
    };

    script.src = API_URL + "?" + query;
    document.body.appendChild(script);

    setTimeout(() => {
      if (window[callbackName]) {
        delete window[callbackName];
        script.remove();
        reject(new Error("API neatbildēja 15 sekunžu laikā."));
      }
    }, 15000);
  });
}

function checkPlateApi(plate) {
  return jsonpRequest({
    action: "check",
    plate: plate
  });
}

function getStatsApi() {
  return jsonpRequest({
    action: "stats"
  });
}
