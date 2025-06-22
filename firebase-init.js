const firebaseConfig = {
  apiKey: "AIzaSyCv0aQq6jTRdPPcTi8yjH4K9goky1IcHqQ",
  authDomain: "among-us-3c0e0.firebaseapp.com",
  databaseURL: "https://among-us-3c0e0-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "among-us-3c0e0",
  storageBucket: "among-us-3c0e0.appspot.com",
  messagingSenderId: "430810539681",
  appId: "1:430810539681:web:6b87449fd40e17cb0b72e0"
};
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
window.db = firebase.database();
