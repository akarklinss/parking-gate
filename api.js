const API_URL = "https://script.google.com/macros/s/AKfycbyX9nF5tnfuU0X9T9Fg1z4gGXeiQQ6e0BVn4uDocJH74bk5YJElw3NpSjmRniVH5n_K/exec";

function jsonpRequest(params) {
  return new Promise((resolve, reject) => {
    const callbackName = "pgCallbackTest" + Date.now();

    window[callbackName] = function(data) {
      resolve(data);
      delete window[callbackName];
      script.remove();
    };

    const script = document.createElement("script");

    const query =
      Object.keys(params)
        .map(key => encodeURIComponent(key) + "=" + encodeURIComponent(params[key]))
        .join("&") +
      "&callback=" + callbackName +
      "&_=" + Date.now();

    script.src = API_URL + "?" + query;

    script.onload = function() {
      // JSONP callback jau apstrādā atbildi
    };

    script.onerror = function() {
      reject(new Error("API skripts neielādējās. URL vai piekļuve nav pareiza."));
      delete window[callbackName];
      script.remove();
    };

    document.head.appendChild(script);

    setTimeout(() => {
      if (window[callbackName]) {
        reject(new Error("API neatbildēja 15 sekunžu laikā."));
        delete window[callbackName];
        script.remove();
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
