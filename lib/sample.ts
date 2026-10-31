import { makeWord, type List } from "./learning";
const NOW = Date.UTC(2026, 9, 30, 12);
const pairs = [
  ["hej", "bonjour"],
  ["tack", "merci"],
  ["snälla", "s’il vous plaît | s'il vous plaît"],
  ["god morgon", "bonjour"],
  ["god kväll", "bonsoir"],
  ["hej då", "au revoir"],
  ["ja", "oui"],
  ["nej", "non"],
  ["ursäkta", "pardon"],
  ["välkommen", "bienvenue"],
  ["vi ses snart", "à bientôt"],
  ["hur mår du?", "comment ça va ?"],
];
export const DEMO_NOW = NOW;
export const sampleLists: List[] = [
  {
    id: "everyday-french",
    title: "Everyday French",
    from: "Swedish",
    to: "French",
    description: "Small words that open up a conversation.",
    words: pairs.map(([front, back], i) => {
      const word = makeWord(front, back, `fr-${i}`);
      word.forward =
        i < 4
          ? { correct: 4, wrong: i % 2, streak: 3, due: NOW + 86400000 * 3 }
          : i < 9
            ? { correct: 2, wrong: (i % 3) + 1, streak: 1, due: NOW - 3600000 }
            : word.forward;
      return word;
    }),
  },
  {
    id: "at-the-cafe",
    title: "At the café",
    from: "Swedish",
    to: "French",
    description: "Order something good. Ask for the bill.",
    words: [
      ["kaffe", "café"],
      ["vatten", "eau"],
      ["bröd", "pain"],
      ["mjölk", "lait"],
      ["socker", "sucre"],
      ["notan", "l’addition | l'addition"],
      ["ett bord", "une table"],
      ["en kopp", "une tasse"],
    ].map(([a, b], i) => makeWord(a, b, `cafe-${i}`)),
  },
  {
    id: "travel-essentials",
    title: "Travel essentials",
    from: "English",
    to: "Spanish",
    description: "Find your way, one word at a time.",
    words: [
      ["train", "tren"],
      ["ticket", "billete | boleto"],
      ["station", "estación"],
      ["airport", "aeropuerto"],
      ["left", "izquierda"],
      ["right", "derecha"],
    ].map(([a, b], i) => makeWord(a, b, `es-${i}`)),
  },
  {
    id: "spanish-travel-sv",
    title: "Spanish for the journey",
    from: "Swedish",
    to: "Spanish",
    description: "Hitta rätt, ett ord i taget.",
    words: [
      ["tåg", "tren"],
      ["biljett", "billete | boleto"],
      ["station", "estación"],
      ["flygplats", "aeropuerto"],
      ["vänster", "izquierda"],
      ["höger", "derecha"],
    ].map(([a, b], i) => makeWord(a, b, `sv-es-${i}`)),
  },
];
