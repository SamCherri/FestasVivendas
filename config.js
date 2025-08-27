// config.js v25 (compatível com app v22)
export const CONFIG = {
  firebaseConfig: {
    apiKey: "AIzaSyB3PHKo18JjC6M-MJLsE431yxHnAZhWdzo",
    authDomain: "festasvivendas.firebaseapp.com",
    projectId: "festasvivendas",
    // storageBucket: "festasvivendas.firebasestorage.app", // não usamos; opcional
    messagingSenderId: "460753271698",
    appId: "1:460753271698:web:984421ed1040d00c2a1f4b"
    // measurementId: "G-4ZN38WR16K" // opcional; ignorado pelo app
  },

  // Use os rótulos exatamente como quer ver no site
  halls: ["Salão Gourmet", "Salão Menor"],

  // Paleta institucional (opcional — hoje não é lida pelo CSS)
  brand: {
    name: "Vivendas de La Salle",
    primary: "#0B74B8",
    secondary: "#0B74B8" // mantém só azul; troque se quiser destaque em outra cor
  }
};