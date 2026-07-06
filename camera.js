let cameraStream = null;

async function startCamera() {
  const video = document.getElementById("cameraPreview");
  const status = document.getElementById("cameraStatus");

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      status.textContent = "Šis pārlūks neatbalsta kameru.";
      return;
    }

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment"
      },
      audio: false
    });

    video.srcObject = cameraStream;
    await video.play();

    status.textContent = "Kamera ieslēgta. OCR tiks pievienots nākamajā solī.";
  } catch (err) {
    status.textContent = "Kameru neizdevās ieslēgt: " + err.name + " " + err.message;
  }
}

function stopCamera() {
  const video = document.getElementById("cameraPreview");
  const status = document.getElementById("cameraStatus");

  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  video.srcObject = null;
  status.textContent = "Kamera apturēta.";
}
