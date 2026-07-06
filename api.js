const API_URL = "https://script.google.com/macros/s/AKfycbyX9nF5tnfuU0X9T9Fg1z4gGXeiQQ6e0BVn4uDocJH74bk5YJElw3NpSjmRniVH5n_K/exec";

function jsonpRequest(params) {
  return new Promise((resolve, reject) => {
    const callbackName = "pgCallback_" + Date.now() + "_" + Math.floor(Math.random() * 100000);

    params.callback = callbackName;

    const query = new URLSearchParams(params).toString();
    const script = document.createElement("script");

    window[callbackName] = function(data) {
      cleanup();
      resolve(data);
    };

    script.onerror = function() {
      cleanup();
      reject(new Error("Neizdevās sazināties ar Google Sheet API."));
    };

    function cleanup() {
      delete window[callbackName];
      script.remove();
    }

    script.src = API_URL + "?" + query;
    document.body.appendChild(script);

    setTimeout(() => {
      if (window[callbackName]) {
        cleanup();
        reject(new Error("API neatbildēja laikā."));
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
