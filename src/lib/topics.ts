import type { Topic, TopicId } from "@/types";

export const TOPICS: Record<TopicId, Topic> = {
  introductions: {
    id: "introductions",
    emoji: "👋",
    titleEN: "Introductions",
    titlePT: "Apresentações",
    descriptionPT: "Conheça pessoas novas e fale sobre você",
    difficulty: "beginner",
    starterMessage:
      "Hi! I'm so happy to chat with you today! Let's start — can you tell me a little about yourself? What's your name, and what do you do?",
    vocabularyHints: [
      "nice to meet you",
      "I work as",
      "I'm from",
      "I enjoy",
      "in my free time",
      "originally",
    ],
  },
  "daily-life": {
    id: "daily-life",
    emoji: "☀️",
    titleEN: "Daily Life",
    titlePT: "Dia a Dia",
    descriptionPT: "Rotinas, hobbies e planos para o fim de semana",
    difficulty: "beginner",
    starterMessage:
      "Hey! How was your day today? Tell me all about it — I want to hear everything!",
    vocabularyHints: [
      "usually",
      "tend to",
      "routine",
      "habit",
      "lately",
      "recently",
      "on weekends",
    ],
  },
  restaurant: {
    id: "restaurant",
    emoji: "🍽️",
    titleEN: "Restaurant",
    titlePT: "Restaurante",
    descriptionPT: "Peça comida, pergunte sobre o cardápio",
    difficulty: "beginner",
    starterMessage:
      "Welcome to The Blue Table! I'm Emma, your server tonight. Can I start you with something to drink, or are you ready to order?",
    vocabularyHints: [
      "I'd like to have",
      "could I get",
      "what do you recommend",
      "is it spicy",
      "on the side",
      "the check please",
    ],
  },
  shopping: {
    id: "shopping",
    emoji: "🛍️",
    titleEN: "Shopping",
    titlePT: "Compras",
    descriptionPT: "Compre roupas e pergunte sobre tamanhos",
    difficulty: "beginner",
    starterMessage:
      "Hi there! Welcome to the store. Are you looking for anything specific today, or just browsing?",
    vocabularyHints: [
      "do you have this in",
      "size",
      "fits well",
      "on sale",
      "try it on",
      "receipt",
      "exchange",
    ],
  },
  doctor: {
    id: "doctor",
    emoji: "🏥",
    titleEN: "Doctor's Visit",
    titlePT: "Médico",
    descriptionPT: "Descreva sintomas e entenda conselhos médicos",
    difficulty: "intermediate",
    starterMessage:
      "Good morning! I'm Doctor Emma. What brings you in today? Tell me how you've been feeling.",
    vocabularyHints: [
      "I've been feeling",
      "it hurts when",
      "for about",
      "sharp pain",
      "dull ache",
      "on and off",
      "symptoms",
    ],
  },
  travel: {
    id: "travel",
    emoji: "✈️",
    titleEN: "Travel & Airport",
    titlePT: "Viagem",
    descriptionPT: "Reserve passagens e navegue por aeroportos",
    difficulty: "intermediate",
    starterMessage:
      "Hello! Welcome to check-in. May I see your passport? Are you checking any bags today?",
    vocabularyHints: [
      "boarding pass",
      "carry-on",
      "departure gate",
      "layover",
      "connecting flight",
      "customs",
    ],
  },
  work: {
    id: "work",
    emoji: "💼",
    titleEN: "Work & Career",
    titlePT: "Trabalho",
    descriptionPT: "Reuniões, entrevistas e conversas no trabalho",
    difficulty: "intermediate",
    starterMessage:
      "Good morning! Thanks for coming in. I'm Emma from HR. Please, have a seat — tell me about your professional background.",
    vocabularyHints: [
      "I have experience in",
      "I'm responsible for",
      "deadline",
      "collaborate",
      "in my previous role",
      "accomplish",
    ],
  },
  "movies-tv": {
    id: "movies-tv",
    emoji: "🎬",
    titleEN: "Movies & TV Shows",
    titlePT: "Filmes e Séries",
    descriptionPT: "Fale sobre filmes, séries e entretenimento",
    difficulty: "intermediate",
    starterMessage:
      "Hey! Have you watched anything good lately? I just finished an amazing series and I can't stop thinking about it!",
    vocabularyHints: [
      "plot twist",
      "character development",
      "binge-watch",
      "cliffhanger",
      "highly recommend",
      "overrated",
      "genre",
    ],
  },
};

export const TOPICS_LIST = Object.values(TOPICS);

export function getTopicById(id: TopicId): Topic {
  return TOPICS[id];
}
