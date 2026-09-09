import { Location } from "./prayerCalc";

export interface Wilaya {
  code: number;
  nameAr: string;
  latitude: number;
  longitude: number;
}

/**
 * Algeria's 58 wilayas (provinces) with their capital's approximate
 * coordinates. All of Algeria uses a single time zone with no DST
 * (Africa/Algiers, UTC+1 year-round), so no per-wilaya timezone is needed.
 *
 * Accuracy note: coordinates for the original 48 wilayas are well-established
 * city locations. The 10 wilayas created in the 2019 southern-provinces
 * split (marked below) are less commonly referenced and their coordinates
 * here are approximate — accurate enough for prayer-time calculation
 * (differences of a few km change prayer times by well under a minute),
 * but if precision matters, the Settings UI's manual latitude/longitude
 * fields let the user fine-tune after picking a wilaya.
 */
export const ALGERIA_WILAYAS: Wilaya[] = [
  { code: 1, nameAr: "أدرار", latitude: 27.87, longitude: -0.29 },
  { code: 2, nameAr: "الشلف", latitude: 36.165, longitude: 1.335 },
  { code: 3, nameAr: "الأغواط", latitude: 33.8, longitude: 2.865 },
  { code: 4, nameAr: "أم البواقي", latitude: 35.87, longitude: 7.11 },
  { code: 5, nameAr: "باتنة", latitude: 35.555, longitude: 6.174 },
  { code: 6, nameAr: "بجاية", latitude: 36.75, longitude: 5.06 },
  { code: 7, nameAr: "بسكرة", latitude: 34.85, longitude: 5.73 },
  { code: 8, nameAr: "بشار", latitude: 31.615, longitude: -2.215 },
  { code: 9, nameAr: "البليدة", latitude: 36.47, longitude: 2.83 },
  { code: 10, nameAr: "البويرة", latitude: 36.38, longitude: 3.9 },
  { code: 11, nameAr: "تمنراست", latitude: 22.785, longitude: 5.53 },
  { code: 12, nameAr: "تبسة", latitude: 35.4, longitude: 8.12 },
  { code: 13, nameAr: "تلمسان", latitude: 34.88, longitude: -1.315 },
  { code: 14, nameAr: "تيارت", latitude: 35.37, longitude: 1.32 },
  { code: 15, nameAr: "تيزي وزو", latitude: 36.71, longitude: 4.05 },
  { code: 16, nameAr: "الجزائر العاصمة", latitude: 36.75, longitude: 3.06 },
  { code: 17, nameAr: "الجلفة", latitude: 34.67, longitude: 3.25 },
  { code: 18, nameAr: "جيجل", latitude: 36.82, longitude: 5.77 },
  { code: 19, nameAr: "سطيف", latitude: 36.19, longitude: 5.41 },
  { code: 20, nameAr: "سعيدة", latitude: 34.83, longitude: 0.15 },
  { code: 21, nameAr: "سكيكدة", latitude: 36.876, longitude: 6.9 },
  { code: 22, nameAr: "سيدي بلعباس", latitude: 35.19, longitude: -0.63 },
  { code: 23, nameAr: "عنابة", latitude: 36.9, longitude: 7.76 },
  { code: 24, nameAr: "قالمة", latitude: 36.46, longitude: 7.43 },
  { code: 25, nameAr: "قسنطينة", latitude: 36.365, longitude: 6.61 },
  { code: 26, nameAr: "المدية", latitude: 36.26, longitude: 2.75 },
  { code: 27, nameAr: "مستغانم", latitude: 35.93, longitude: 0.09 },
  { code: 28, nameAr: "المسيلة", latitude: 35.705, longitude: 4.54 },
  { code: 29, nameAr: "معسكر", latitude: 35.4, longitude: 0.14 },
  { code: 30, nameAr: "ورقلة", latitude: 31.95, longitude: 5.32 },
  { code: 31, nameAr: "وهران", latitude: 35.7, longitude: -0.63 },
  { code: 32, nameAr: "البيض", latitude: 33.68, longitude: 1.02 },
  { code: 33, nameAr: "إليزي", latitude: 26.48, longitude: 8.47 },
  { code: 34, nameAr: "برج بوعريريج", latitude: 36.07, longitude: 4.76 },
  { code: 35, nameAr: "بومرداس", latitude: 36.766, longitude: 3.475 },
  { code: 36, nameAr: "الطارف", latitude: 36.77, longitude: 8.31 },
  { code: 37, nameAr: "تندوف", latitude: 27.67, longitude: -8.15 },
  { code: 38, nameAr: "تيسمسيلت", latitude: 35.61, longitude: 1.81 },
  { code: 39, nameAr: "الوادي", latitude: 33.35, longitude: 6.87 },
  { code: 40, nameAr: "خنشلة", latitude: 35.435, longitude: 7.14 },
  { code: 41, nameAr: "سوق أهراس", latitude: 36.286, longitude: 7.95 },
  { code: 42, nameAr: "تيبازة", latitude: 36.59, longitude: 2.45 },
  { code: 43, nameAr: "ميلة", latitude: 36.45, longitude: 6.26 },
  { code: 44, nameAr: "عين الدفلى", latitude: 36.264, longitude: 1.97 },
  { code: 45, nameAr: "النعامة", latitude: 33.27, longitude: -0.31 },
  { code: 46, nameAr: "عين تموشنت", latitude: 35.3, longitude: -1.14 },
  { code: 47, nameAr: "غرداية", latitude: 32.49, longitude: 3.67 },
  { code: 48, nameAr: "غليزان", latitude: 35.74, longitude: 0.56 },
  // الولايات العشر الجديدة (تقسيم 2019) — إحداثيات تقريبية
  { code: 49, nameAr: "تيميمون", latitude: 29.26, longitude: 0.23 },
  { code: 50, nameAr: "برج باجي مختار", latitude: 21.33, longitude: 0.95 },
  { code: 51, nameAr: "أولاد جلال", latitude: 34.42, longitude: 5.07 },
  { code: 52, nameAr: "بني عباس", latitude: 30.13, longitude: -2.16 },
  { code: 53, nameAr: "عين صالح", latitude: 27.19, longitude: 2.48 },
  { code: 54, nameAr: "عين قزام", latitude: 19.57, longitude: 5.77 },
  { code: 55, nameAr: "تقرت", latitude: 33.1, longitude: 6.06 },
  { code: 56, nameAr: "جانت", latitude: 24.55, longitude: 9.48 },
  { code: 57, nameAr: "المغير", latitude: 33.95, longitude: 5.93 },
  { code: 58, nameAr: "المنيعة", latitude: 30.58, longitude: 2.88 },
];

export function wilayaToLocation(wilaya: Wilaya): Location {
  return {
    latitude: wilaya.latitude,
    longitude: wilaya.longitude,
    timeZoneId: "Africa/Algiers",
  };
}

/**
 * Communes (the third administrative level, below wilaya and daïra) for
 * the location picker's Wilaya → Commune cascade.
 *
 * HONEST SCOPE NOTE — read before assuming this is complete: Algeria has
 * 1,541 official communes. Reliably listing all of them by name, correctly
 * grouped under their wilaya, from memory, without an actual dataset to
 * check against, is not something that can be done accurately — attempting
 * it risks silently wrong/missing communes, which is worse than admitting
 * the gap. What's here instead is a best-effort list of the commune(s) per
 * wilaya that are well-established/high-confidence (usually the wilaya's
 * own capital, plus a few widely-known cities for the larger wilayas) —
 * NOT the complete official list. The 10 wilayas created in 2019 (southern
 * split) list only their capital, since their internal commune breakdown
 * is less commonly referenced.
 *
 * All communes under a given wilaya currently share that wilaya's
 * coordinates (see ALGERIA_WILAYAS) — there is no independently-verified
 * per-commune coordinate data here. For prayer-time purposes this is a
 * reasonable approximation (communes within one wilaya are typically close
 * enough that calculated times differ by well under a minute), but it is
 * an approximation, not commune-precise geodata.
 *
 * If a complete, accurate commune dataset (e.g. from Algeria's ONS, or an
 * OpenStreetMap extract) is provided, this should be replaced wholesale
 * rather than extended piecemeal.
 */
export const COMMUNES_BY_WILAYA: Record<number, string[]> = {
  1: ["أدرار", "رقان", "أولف", "تيميمون"],
  2: ["الشلف", "تنس", "الأبيض مجاجة", "أولاد فارس"],
  3: ["الأغواط", "أفلو", "حاسي الدلاعة"],
  4: ["أم البواقي", "عين مليلة", "عين البيضاء", "الحرمة"],
  5: ["باتنة", "بريكة", "عين التوتة", "تازولت", "مروانة"],
  6: ["بجاية", "أقبو", "تيشي", "سيدي عيش", "أميزور"],
  7: ["بسكرة", "طولقة", "سيدي عقبة", "أوماش"],
  8: ["بشار", "كنادسة", "تاغيت", "العبادلة"],
  9: ["البليدة", "بوفاريك", "موزاية", "العفرون"],
  10: ["البويرة", "سور الغزلان", "الأخضرية", "برج أخريص"],
  11: ["تمنراست", "عين صالح", "عين قزام"],
  12: ["تبسة", "الشريعة", "بئر العاتر", "الونزة"],
  13: ["تلمسان", "مغنية", "ندرومة", "الرمشي", "شتوان"],
  14: ["تيارت", "قصر الشلالة", "سوقر", "مهدية"],
  15: ["تيزي وزو", "عزازقة", "ذراع بن خدة", "بوغني", "تيقزيرت"],
  16: ["الجزائر الوسطى", "باب الوادي", "حسين داي", "الحراش", "بئر مراد رايس", "الدار البيضاء"],
  17: ["الجلفة", "عين وسارة", "حاسي بحبح"],
  18: ["جيجل", "الطاهير", "الميلية", "الشقفة"],
  19: ["سطيف", "العلمة", "عين ولمان", "بوقاعة", "عين الكبيرة"],
  20: ["سعيدة", "عين الحجر", "يوب"],
  21: ["سكيكدة", "عزابة", "الحروش", "القل", "رمضان جمال"],
  22: ["سيدي بلعباس", "تلاغ", "سفيزف", "بن باديس"],
  23: ["عنابة", "البوني", "برحال", "الحجار"],
  24: ["قالمة", "بوشقوف", "هيليوبوليس", "وادي الزناتي"],
  25: ["قسنطينة", "الخروب", "زيغود يوسف", "حامة بوزيان"],
  26: ["المدية", "قصر البخاري", "البرواقية", "عين بوسيف"],
  27: ["مستغانم", "عين تادلس", "بوقيراط", "حاسي ماماش"],
  28: ["المسيلة", "بوسعادة", "سيدي عيسى", "عين الملح"],
  29: ["معسكر", "المحمدية", "غريس", "سيق"],
  30: ["ورقلة", "حاسي مسعود", "تقرت", "المقارين"],
  31: ["وهران", "السانية", "بئر الجير", "عين الترك", "أرزيو"],
  32: ["البيض", "بوقطب", "الأبيض سيدي الشيخ"],
  33: ["إليزي", "جانت", "برج عمر إدريس"],
  34: ["برج بوعريريج", "رأس الوادي", "المنصورة"],
  35: ["بومرداس", "بودواو", "الثنية", "دلس", "برج منايل"],
  36: ["الطارف", "بوثلجة", "القالة", "بن مهيدي"],
  37: ["تندوف", "أم العسل"],
  38: ["تيسمسيلت", "برج بونعامة", "خميستي"],
  39: ["الوادي", "المغير", "جامعة", "قمار", "البياضة"],
  40: ["خنشلة", "قايس", "بابار"],
  41: ["سوق أهراس", "سدراتة", "المشروحة"],
  42: ["تيبازة", "شرشال", "القليعة", "حجوط", "بوهارون"],
  43: ["ميلة", "فرجيوة", "شلغوم العيد", "تاجنانت"],
  44: ["عين الدفلى", "خميس مليانة", "مليانة", "العطاف"],
  45: ["النعامة", "مشرية", "عين الصفراء"],
  46: ["عين تموشنت", "حمام بوحجر", "المالح", "الأمير عبد القادر"],
  47: ["غرداية", "متليلي", "المنيعة", "بريان"],
  48: ["غليزان", "وادي رهيو", "مازونة", "عمي موسى"],
  49: ["تيميمون"],
  50: ["برج باجي مختار"],
  51: ["أولاد جلال"],
  52: ["بني عباس"],
  53: ["عين صالح"],
  54: ["عين قزام"],
  55: ["تقرت"],
  56: ["جانت"],
  57: ["المغير"],
  58: ["المنيعة"],
};
