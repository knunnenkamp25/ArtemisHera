/* =========================================================================
   ArtemisHera — shared data: config, universes, keyword dictionaries
   ========================================================================= */

// ── Configuration ──────────────────────────────────────────────────────────
const CONFIG = {
  // GitHub deployment (used for workflow dispatch + status polling)
  GH_OWNER: 'knunnenkamp25',
  GH_REPO: 'ArtemisHera',
  GH_WORKFLOW: 'scrape.yml',
  GH_VOTES_WORKFLOW: 'federal-votes.yml',

  // Universe sheet — the single source of truth for ALL matching (votes, oppo
  // books, documents, news). A default can be baked in here, but the Settings
  // page can override it at runtime so the list can be re-pointed without a
  // code change. Sheet must be shared "Anyone with the link can view".
  UNIVERSE_SHEET_ID: '',
  UNIVERSE_SHEET_GID: '0',

  MAX_MANUAL_URLS: 5,      // manual web-scrape page limit

  // The UCLA mirror has been unreachable; the browser path uses voteview.com
  // only so a dead host doesn't double every timeout. The server-side scripts
  // still try both.
  VOTEVIEW_URLS: ['https://voteview.com/static/data/out'],
  // State legislative data lives in a separate repo — a 50-state backfill blows
  // past the 1 GB GitHub Pages site cap. raw.githubusercontent sends
  // `access-control-allow-origin: *`, so this is a plain cross-origin fetch with
  // no proxy. Set STATE_DATA_LOCAL to prefer an in-repo copy (dev, or a small
  // committed subset) and fall back to the data repo when a session is missing.
  STATE_DATA_BASE: 'https://raw.githubusercontent.com/knunnenkamp25/ArtemisHera-data/main/data/state',
  // Optional in-repo override, empty by default. A partial local copy would
  // shadow the full index in the data repo, so only set this when you
  // deliberately want to test against local data.
  STATE_DATA_LOCAL: '',
};

const CAST_CODES = {1:'Yes',2:'Yes',3:'Yes',4:'No',5:'No',6:'No',7:'Present',8:'Present',9:'Not Voting'};

// ── CORS proxies (battle-tested chain from congress-votes) ─────────────────
const PROXIES = [
  url => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
  url => 'https://corsproxy.io/' + encodeURIComponent(url),
  url => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url),
];

// ── Universe → keyword patterns ────────────────────────────────────────────
// Curated phrase patterns for vote/bill-text matching, keyed by universe name
// (ported from the congress-votes TOPIC_KEYWORDS dictionary and remapped onto
// the unified universe list). Universes without an entry fall back to matching
// their full lowercased name as a phrase — see universePatterns().
const UNIVERSE_KEYWORDS = {
  'Election Integrity Priority': ['election', 'turnout', 'voting rights', 'voter registration', 'ballot', 'polling', 'franchise', 'suffrage', 'electoral'],
  'Early Voters': ['early voting', 'absentee', 'mail-in', 'mail ballot', 'vote by mail', 'provisional ballot'],
  'Mail Voters': ['mail ballot', 'vote by mail', 'absentee', 'mail-in', 'drop box'],
  'Urban Density Advocates': ['urban', 'rural', 'suburban', 'metropolitan', 'inner city', 'housing density', 'zoning', 'land use', 'community development'],
  'Sporadic Voters': ['election', 'voter', 'turnout', 'registration', 'ballot access', 'civic engagement'],
  'Political Donors': ['campaign finance', 'political contribution', 'fundraising', 'donor', 'pac', 'super pac', 'citizens united', 'fec'],
  'Community Activists': ['protest', 'demonstration', 'activism', 'grassroots', 'civil rights', 'civil liberties', 'first amendment', 'free speech', 'petition'],
  'Military Family': ['military', 'armed forces', 'defense', 'pentagon', 'dod', 'troops', 'servicemember', 'national guard', 'reserves', 'deployment', 'base closure'],
  'Veterans': ['veteran', 'va ', 'veterans affairs', 'gi bill', 'vfw', 'disabled veteran', 'ptsd', 'wounded warrior', 'military service'],
  'Second Amendment Supporters': ['gun', 'firearm', 'second amendment', '2nd amendment', 'ammunition', 'concealed carry', 'nra', 'atf', 'rifle', 'pistol', 'handgun', 'silencer', 'suppressor', 'bump stock'],
  'Gun Control Advocates': ['gun violence', 'background check', 'red flag', 'assault weapon', 'gun safety', 'school shooting'],
  'Small Business Owners': ['small business', 'small-business', 'sba', 'entrepreneur', 'startup', 'sole proprietor', 'microloan', 'paycheck protection', 'ppp'],
  'Parents': ['parent', 'child care', 'childcare', 'family leave', 'parental', 'custody', 'adoption', 'foster', 'child tax credit', 'child welfare'],
  'Caregivers': ['caregiver', 'child', 'children', 'juvenile', 'pediatric', 'school lunch', 'snap', 'chip', 'head start', 'elder care', 'long-term care'],
  'Homeowners': ['homeowner', 'home owner', 'mortgage', 'property tax', 'home equity', 'housing', 'hud', 'fannie mae', 'freddie mac', 'fha', 'real estate'],
  'Renters': ['renter', 'tenant', 'rent', 'rental', 'eviction', 'affordable housing', 'section 8', 'housing voucher', 'landlord'],
  'Streaming Service Subscribers': ['streaming', 'broadband', 'internet access', 'digital divide', 'net neutrality', 'fcc', 'cord cutting'],
  'Cable News Watchers': ['broadcast', 'television', 'tv ', 'cable', 'fcc', 'spectrum', 'telecommunications'],
  'Social Media Active': ['social media', 'facebook', 'twitter', 'tiktok', 'instagram', 'online platform', 'section 230', 'content moderation', 'algorithm', 'data privacy', 'big tech'],
  'Online Community Engaged': ['misinformation', 'disinformation', 'censorship', 'online safety', 'digital literacy'],
  'Education Priority': ['education', 'school', 'student', 'college', 'university', 'curriculum', 'tuition', 'title i', 'stem', 'vocational', 'higher education', 'k-12', 'elementary', 'secondary', 'charter school'],
  'Teachers': ['teacher', 'classroom', 'public school', 'school board', 'education funding'],
  'Student Loan Concerned': ['student loan', 'tuition', 'pell grant', 'loan forgiveness', 'student debt'],
  'Home Values Concerned': ['zoning', 'land use', 'building permit', 'eminent domain', 'landfill', 'transmission line', 'property value'],
  'First Generation Immigrant': ['language', 'bilingual', 'esl', 'translation', 'interpreter', 'multilingual', 'naturalization'],
  'Second Generation Immigrant': ['english', 'esl', 'bilingual', 'citizenship', 'immigrant family'],
  'Age 65+': ['senior', 'aging', 'elderly', 'retirement', 'medicare', 'social security', 'pension', 'nursing home', 'assisted living'],
  'Pro-Life': ['abortion', 'pro-life', 'prolife', 'pro life', 'unborn', 'fetus', 'roe', 'planned parenthood', 'hyde amendment', 'dobbs'],
  'Pro-Choice': ['reproductive', 'contraception', 'birth control', 'family planning', 'abortion access', 'roe'],
  'Urban': ['transit', 'public transit', 'pedestrian', 'sidewalk', 'bike lane', 'commute', 'urban planning'],
  'Social Justice Advocates': ['gender', 'title ix', 'pay equity', 'equal pay', 'sexual harassment', 'domestic violence', 'violence against women', 'vawa', 'discrimination'],
  'Law and Order': ['crime', 'criminal', 'prison', 'incarceration', 'sentencing', 'public safety', 'fbi', 'dea', 'drug trafficking', 'gang', 'theft', 'robbery', 'homicide', 'murder', 'assault'],
  'Law Enforcement': ['police', 'law enforcement', 'sheriff', 'first responder', 'officer'],
  'Criminal Justice Reform': ['sentencing reform', 'bail reform', 'recidivism', 'parole', 'expungement', 'mandatory minimum', 'justice reform'],
  'Economic Populists': ['inflation', 'cost of living', 'consumer price', 'gas price', 'grocery', 'food price', 'wage', 'affordability', 'price gouging', 'wall street'],
  'Minimum Wage Supporters': ['minimum wage', 'living wage', 'wage theft', 'overtime pay'],
  'Healthcare Cost Concerned': ['health care', 'healthcare', 'medical', 'insurance', 'medicaid', 'medicare', 'prescription', 'drug price', 'pharmaceutical', 'hospital', 'affordable care act', 'aca', 'obamacare', 'copay', 'deductible', 'premium'],
  'Healthcare Workers': ['nurse', 'physician', 'hospital staffing', 'medical workforce'],
  'Mental Health Priority': ['mental health', 'suicide prevention', 'behavioral health', 'substance abuse', 'opioid', 'addiction', 'counseling'],
  'Conservation Minded': ['conservation', 'wildlife', 'hunting', 'fishing', 'forest', 'national park', 'public land', 'endangered species', 'wilderness'],
  'Climate/Environment Priority': ['climate', 'emission', 'carbon', 'pollution', 'clean air', 'clean water', 'epa', 'greenhouse', 'environmental protection', 'sustainability'],
  'Renewable Energy Supporters': ['renewable', 'solar', 'wind energy', 'clean energy', 'green energy', 'energy efficiency'],
  'Fossil Fuel Industry': ['oil and gas', 'drilling', 'fracking', 'pipeline', 'coal', 'petroleum', 'refinery', 'offshore drilling'],
  'Border Security Priority': ['border security', 'border wall', 'illegal immigration', 'deportation', 'asylum', 'border patrol', 'sanctuary'],
  'Immigration Advocates': ['immigrant', 'daca', 'dreamer', 'pathway to citizenship', 'refugee', 'visa'],
  'Union Households': ['union', 'collective bargaining', 'right to work', 'prevailing wage', 'nlrb', 'organized labor'],
  'Labor Rights Priority': ['worker protection', 'workplace safety', 'osha', 'paid leave', 'family leave', 'labor rights'],
  'Manufacturing Workers': ['manufacturing', 'factory', 'trade', 'infrastructure', 'job training', 'apprenticeship', 'supply chain'],
  'Trade Deal Skeptics': ['tariff', 'trade deal', 'nafta', 'china trade', 'outsourcing', 'trade deficit'],
  'High Debt Ratio': ['poverty', 'unemployment', 'jobless', 'welfare', 'food stamp', 'snap', 'tanf', 'economic hardship', 'debt', 'bankruptcy', 'foreclosure', 'homelessness'],
  'Anti-Tax': ['tax increase', 'tax hike', 'tax cut', 'tax relief', 'income tax', 'sales tax', 'irs', 'tax burden'],
  'Tax Fairness Priority': ['tax loophole', 'corporate tax', 'wealth tax', 'fair share', 'tax avoidance'],
  'Property Tax Concerned': ['property tax', 'assessment', 'homestead exemption', 'levy'],
  'Affordable Housing Priority': ['affordable housing', 'housing crisis', 'housing assistance', 'housing voucher', 'homelessness', 'rent control'],
  'Government Transparency Priority': ['transparency', 'foia', 'open records', 'ethics', 'disclosure', 'accountability', 'inspector general', 'government waste'],
  'National News Readers': ['media', 'press', 'journalism', 'broadcast', 'news', 'foia'],
  'Influencer Followers': ['influencer', 'content creator', 'online platform', 'digital'],
  'Swing Voters': ['bipartisan', 'crossover', 'independent', 'realignment', 'moderate'],
  'COVID Vaccine Concerned': ['vaccine mandate', 'vaccination', 'covid', 'pandemic', 'lockdown', 'mask mandate'],
  'Agricultural Workers': ['farm', 'agriculture', 'crop', 'livestock', 'usda', 'farm bill', 'dairy', 'ranch'],
  'Rural': ['rural', 'broadband expansion', 'small town', 'farm community'],
  'Disability Community': ['disability', 'americans with disabilities', 'accessible', 'special needs', 'ssdi', 'supplemental security income'],
  'Christian Voters': ['religious liberty', 'religious freedom', 'faith-based', 'prayer', 'church'],
};

// ── Pattern strength ───────────────────────────────────────────────────────
// A lone generic word ("housing", "school") is thin evidence; a multi-word
// phrase or an unambiguous anchor word is solid. Matching requires one strong
// hit or two independent weak hits — see votes.js / matchTextToUniverses.
const ANCHOR_WORDS = new Set([
  'gun','firearm','nra','atf','rifle','pistol','handgun','ammunition','silencer','suppressor',
  'abortion','unborn','fetus','roe','dobbs','contraception',
  'medicare','medicaid','obamacare','prescription','pharmaceutical',
  'veteran','vfw','ptsd','servicemember','military','troops','pentagon','defense',
  'immigrant','daca','dreamer','asylum','deportation',
  'tariff','pension','broadband','opioid','tuition',
  'renter','tenant','eviction','landlord','homeowner','mortgage',
  'inflation','teacher','farm','usda','livestock',
  'conservation','wildlife','hunting','wilderness',
  'climate','carbon','pollution','solar','fracking','pipeline',
  'police','sheriff','prison','incarceration','sentencing','parole',
  'union','osha','nlrb',
  'absentee','disability','ssdi','snap','tanf','foia',
]);

function patternStrength(p) {
  const t = (p || '').trim();
  return t.includes(' ') || ANCHOR_WORDS.has(t) ? 'strong' : 'weak';
}

// Patterns for any universe: the curated set if one exists, otherwise the full
// lowercased name as a single phrase (len >= 6 avoids noisy short-word names).
// User-trained rules (pins add patterns, bans remove them) are applied on top —
// see MatchRules in util.js.
function universePatterns(name) {
  let base = UNIVERSE_KEYWORDS[name];
  if (!base) {
    const low = (name || '').toLowerCase();
    base = low.length >= 6 ? [low] : [];
  }
  if (typeof MatchRules !== 'undefined') return MatchRules.apply(name, base);
  return base;
}

// Substring matching is fine for long phrases but poisons short ones —
// 'ssi' hits "commission", 'ada ' hits "Canada". Patterns under 5 chars
// must match on word boundaries.
function patternHit(hay, pattern) {
  const p = pattern.trim();
  if (p.length >= 5) return hay.includes(pattern);
  return new RegExp('\\b' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(hay);
}

// ── Legislative stop words (tuned for bill language) ───────────────────────
const STOP = new Set('a an the of to for in on and or by with from at is it be as that this which act bill resolution provide providing amend relating united states america congress house senate section purpose purposes other certain establish authorize making regarding concerning department federal require general agreeing agreed passage motion table suspend rules stat app cong sess under title joint submitted chapter code proceed upon cloture nomination confirmation invoke invoking calendar consideration referred clerk thereof shall may such not into been has have would further than its all secretary virginia florida texas california ohio new york pennsylvania georgia illinois michigan north carolina south carolina arizona colorado missouri indiana iowa oregon utah district columbia judge circuit court united states nomination'.split(' '));

// ── Poseidon conceptual universes (211) — used for oppo/document matching ──
const POSEIDON_UNIVERSES = [
'Affordable Housing Priority','African American Voters','Age 18-24','Age 25-34','Age 35-44','Age 45-54','Age 55-64','Age 65+','Agricultural Workers','Alternative Medicine Interested','Anime/Manga Fans','Anti-Tax','Anti-Wall Street','Appalachian Region','Asian American Voters','Black Lives Matter Supporters','Border Security Concerned','Border Security Priority','Business Executives','CNN Audience','COVID Vaccine Concerned','Cable News Watchers','Caregivers','Charity Donors','Christian Radio Listeners','Christian Voters','Chronic Disease Management','Church Attendees','Civic Organization Members','Climate Skeptics','Climate/Environment Priority','Coal Country','College Educated','Comic Book Fans','Community Activists','Conservation Minded','Conservative','Conservative News Readers','Consistent Voters','Constitution Priority','Construction Workers','Content Creator Interested','Criminal Justice Reform','Cryptocurrency Investors','Cultural Conservatives','Debate Watchers','Democracy Defenders','Desert Southwest','Digital News Subscribers','Disability Community','Disability Services Users','Diversity Advocates','Early Tech Adopters','Early Voters','Economic Populists','Education Administrators','Education Priority','Election Integrity Priority','Environmental Activists','Environmental Group Members','Esports Fans','Farm Country','Finance Industry Workers','First Generation Immigrant','First Time Homebuyers','Fitness Enthusiasts','Fitness Program Participants','Fossil Fuel Industry','Fox News Audience','Freelance Workers','Fundraising Event Attendees','Gaming Community','Gen Z','Gig Economy Workers','Government Employees','Government Transparency Priority','Graduate Degree','Great Plains','Gun Control Advocates','HOA Members','Health Conscious','Healthcare Cost Concerned','Healthcare Priority','Healthcare Workers','High Debt Ratio','High Propensity Voters','High School Only','Holistic Health Followers','Home Values Concerned','Homeowners','Hospitality Workers','Housing Shortage Concerned','Immigration Advocates','Immigration Reformers','Independent Leaning Democrat','Independent Leaning Republican','Influencer Followers','Investigative Journalism Readers','Jewish Voters','LGBTQ+ Supporters','Labor Rights Priority','Late Night Comedy Watchers','Latino Voters','Law Enforcement','Law and Order','Legal Professionals','Liberal','Liberal News Readers','Likely Voters','Local News Readers','Low Propensity Voters','MSNBC Audience','Mail Voters','Manufacturing Workers','Married','Mental Health Awareness','Mental Health Priority','Midwest','Military Family','Military Personnel','Millennials','Minimum Wage Supporters','Moderate','Mountain West','Multi-Unit Dwellers','Muslim Voters','NPR Listeners','National News Readers','Neighborhood Association Members','New Voters','News Documentary Viewers','Nonprofit Leaders','Northeast Corridor','Nutrition Conscious','Oil & Gas Region','Online Community Engaged','Organic Food Buyers','Outdoor Recreation','Pacific Northwest','Parent Organization Active','Parents','Party Loyalists - Democrat','Party Loyalists - Republican','Passive Income Seeking','Petition Signers','Podcast Listeners','Political Donors','Preventive Care Priority','Print Newspaper Readers','Pro-Business','Pro-Choice','Pro-Life','Progressive','Property Tax Concerned','Real Estate Investors','Real Estate Professionals','Religious Community Active','Remote Work Preference','Renewable Energy Supporters','Renters','Retail Workers','Rural','Rural Character Preservationists','Rust Belt Residents','Savings Focused','School Board Advocates','Second Amendment Supporters','Second Generation Immigrant','Self-Employed','Side Hustle Entrepreneurs','Single Female','Single Male','Sleep Health Priority','Small Business Operators','Small Business Owners','Social Justice Advocates','Social Media Active','South','Sporadic Voters','Sports Enthusiasts','Sports News Followers','Streaming Service Subscribers','Student Loan Concerned','Substance Abuse Recovery','Suburban','Suburban Values Priority','Sun Belt Residents','Sustainable Products Interested','Swing Voters','Tax Fairness Priority','Teachers','Tech Industry Workers','Tech Innovation Followers','Tech Savvy','Trade Deal Skeptics','Trade Deal Supporters','Traditional Values Voters','Transportation Workers','Union Households','Urban','Urban Density Advocates','Vaccine Skeptics','Veterans','Video Streaming Users','Volunteer Active','Voter Registration Concerned','Wellness App Users','West Coast','White Working Class','Wine Country','Work-Life Balance Priority',
];

// ── Attack extraction categories (Poseidon's 23) ───────────────────────────
const ATTACK_CATEGORIES = [
  'Voting Record','Campaign Finance','Statements & Quotes','Associations & Endorsements',
  'Professional History','Financial & Ethics','Legal Issues','Personal',
  'Tax & Fiscal Policy','Healthcare','Immigration','Gun Policy','Education',
  'Energy & Environment','National Security & Foreign Policy','Social Issues',
  'Economic Policy','Government & Transparency','COVID/Pandemic Response',
  'Hypocrisy Angles','Geographic/Residency','Staff & Management','Media & Public Perception',
];

// Category detection keywords for the client-side extraction engine
const CATEGORY_KEYWORDS = {
  'Voting Record': ['voted','vote','roll call','yea','nay','abstained','missed vote','absent for','co-sponsored','cosponsored','sponsored'],
  'Campaign Finance': ['donation','donor','contribution','pac','super pac','fundrais','dark money','campaign cash','lobbyist money','corporate money','fec'],
  'Tax & Fiscal Policy': ['tax','taxes','spending','deficit','debt ceiling','budget','fiscal','earmark','pork'],
  'Healthcare': ['health care','healthcare','medicare','medicaid','obamacare','affordable care','prescription','insurance','drug price','hospital'],
  'Immigration': ['immigration','immigrant','border','amnesty','sanctuary','visa','asylum','deportation','ice '],
  'Gun Policy': ['gun','firearm','second amendment','nra','concealed carry','assault weapon','background check'],
  'Education': ['school','education','teacher','student','curriculum','tuition','student loan','university','college'],
  'Energy & Environment': ['climate','environment','epa','fossil fuel','oil','gas','coal','pipeline','renewable','solar','wind','emission','green new deal','carbon'],
  'National Security & Foreign Policy': ['military','defense','troops','war','foreign aid','china','russia','iran','israel','nato','terrorism','national security'],
  'Social Issues': ['abortion','pro-life','pro-choice','lgbt','transgender','marriage','religious liberty','criminal justice','police'],
  'Economic Policy': ['jobs','economy','trade','tariff','minimum wage','union','labor','manufacturing','inflation','wages'],
  'Financial & Ethics': ['stock','insider','conflict of interest','ethics','disclosure','financial disclosure','sec ','investment','profited'],
  'Legal Issues': ['lawsuit','sued','indicted','charged','arrested','investigation','subpoena','settlement','court','convicted','felony','fraud'],
  'Government & Transparency': ['transparency','foia','records','waste','audit','accountability','earmark','government spending'],
  'COVID/Pandemic Response': ['covid','pandemic','lockdown','vaccine','mandate','ppp loan','relief fund'],
  'Statements & Quotes': ['said','stated','told','tweeted','wrote','claimed','admitted','quote','remarks'],
  'Associations & Endorsements': ['endorsed','endorsement','ally','allied','associated with','ties to','linked to','appeared with','campaigned with'],
  'Professional History': ['lobbyist','lobbied','career','worked for','employed','business record','ceo','executive','consultant'],
  'Personal': ['residence','lives in','family','divorce','personal','lifestyle'],
  'Hypocrisy Angles': ['hypocrisy','hypocrite','despite','while claiming','flip-flop','flip flop','reversed','contradicts','but voted','yet voted'],
  'Geographic/Residency': ['carpetbag','moved to','out-of-state','out of state','district resident','residency','primary residence'],
  'Staff & Management': ['staff','turnover','workplace','harassment complaint','office culture','aide'],
  'Media & Public Perception': ['editorial','op-ed','fact check','fact-check','gaffe','criticized by','slammed','blasted'],
};

// Signal phrases that indicate an attack-worthy sentence
const ATTACK_SIGNALS = [
  'voted against','voted for','voted no','voted yes','voted to','voted with','opposed','supported',
  'failed to','refused to','refuses to','missed','was absent','skipped',
  'took money','accepted','received \$','received money','pocketed','profited','raised taxes','cut funding','slashed',
  'sued','lawsuit','indicted','charged with','arrested','under investigation','investigated','fined','violated','convicted',
  'flip-flopped','reversed','contradicted','despite','while claiming','hypocris',
  'criticized','blasted','slammed','condemned','accused of','admitted','caught',
  'donated to','funded by','bankrolled','dark money','lined his pockets','lined her pockets',
  'lobbied','lobbyist','conflict of interest','insider trading','stock trades','ethics complaint',
  'the only member','one of only','out of touch','sided with','stood with','abandoned','betrayed','turned his back','turned her back',
];

const SEVERITY_ORDER = ['Major','Moderate','Minor','Niche'];

// ── Hera: channel + phase definitions ──────────────────────────────────────
const HERA_CHANNELS = [
  { id:'email',  name:'Email',          icon:'✉' },
  { id:'social', name:'Social Media',   icon:'◫' },
  { id:'sms',    name:'Texting / SMS',  icon:'▤' },
  { id:'press',  name:'Earned Media',   icon:'▣' },
  { id:'ads',    name:'Digital Ads',    icon:'◨' },
];


