const API_URL = "https://script.google.com/u/0/home/projects/1q9JbDZmk-9epuxnAX80amFfWLciyyfGUAFXTLdbmcZ3rVNYnNhdKAMK4/edit";

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
