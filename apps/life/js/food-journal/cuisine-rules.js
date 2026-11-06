// Cuisine from what a dish is called or tagged. Used to prepare cuisine quick
// checks with no AI; Adam still taps Yes on each group before anything lands.
// Words that name a cuisine come first, so "Thai fried chicken" is Thai, not
// American. Café and Pub cover the breakfast and pub plates no country fits.
export const CUISINE_RULES = [
  { key: "thai", cuisine: "Thai", words: ["thai", "pad thai", "som tam"] },
  { key: "indian", cuisine: "Indian", words: ["indian", "dosa", "biryani", "tikka", "naan", "dal"] },
  { key: "greek", cuisine: "Greek", words: ["greek", "souvlaki", "gyros", "gyro", "spanakopita"] },
  { key: "mediterranean", cuisine: "Mediterranean", words: ["mediterranean"] },
  { key: "middle_eastern", cuisine: "Middle Eastern", words: ["middleeastern", "middle eastern", "falafel", "shawarma", "hummus", "lebanese"] },
  { key: "japanese", cuisine: "Japanese", words: ["japanese", "ramen", "sushi", "katsu", "udon", "gyoza", "karaage"] },
  { key: "korean", cuisine: "Korean", words: ["korean", "bibimbap", "kimchi"] },
  { key: "chinese", cuisine: "Chinese", words: ["chinese", "dumplings", "dumpling", "bao", "dim sum", "yum cha"] },
  { key: "vietnamese", cuisine: "Vietnamese", words: ["vietnamese", "pho", "banh mi"] },
  { key: "malaysian", cuisine: "Malaysian", words: ["malaysian", "laksa", "nasi lemak"] },
  { key: "mexican", cuisine: "Mexican", words: ["mexican", "taco", "tacos", "nachos", "burrito", "quesadilla", "churros"] },
  { key: "spanish", cuisine: "Spanish", words: ["spanish", "paella", "tapas", "croquettes", "croquetas"] },
  { key: "french", cuisine: "French", words: ["french", "croissant", "crepe", "crêpe"] },
  { key: "turkish", cuisine: "Turkish", words: ["turkish", "gozleme", "pide"] },
  { key: "italian", cuisine: "Italian", words: ["italian", "pasta", "lasagne", "lasagna", "pizza", "gnocchi", "risotto", "carbonara", "arancini", "garlicbread", "garlic bread"] },
  { key: "american", cuisine: "American", words: ["american", "burger", "cheeseburger", "slider", "fried chicken", "chicken tenders", "wings", "hot dog", "loaded fries", "mac and cheese"] },
  { key: "cafe", cuisine: "Café", words: ["breakfast", "breakdast", "brunch", "eggs benedict", "breakfast sandwich", "toastie", "smashed avo", "pancakes", "bagel", "toast"] },
  { key: "pub", cuisine: "Pub", words: ["schnitzel", "parmigiana", "parmy", "parma", "pubfood", "pub food", "steak sandwich", "steak", "pie", "pietour", "fish and chips"] },
];

const words = (text) =>
  ` ${String(text || "").toLowerCase().replace(/[^a-z0-9À-ɏ]+/g, " ").trim()} `;

// The first rule a tag or the dish name matches, or null.
export function cuisineRuleFor(dish) {
  const tags = (dish.tags || []).map((t) => words(t));
  const title = words(dish.title);
  for (const rule of CUISINE_RULES)
    for (const w of rule.words) {
      const needle = ` ${w} `;
      if (tags.some((t) => t === needle) || title.includes(needle)) return rule;
    }
  return null;
}
