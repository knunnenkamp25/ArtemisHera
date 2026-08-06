/* =========================================================================
   ArtemisHera — shared data: config, universes, keyword dictionaries
   ========================================================================= */

// ── Configuration ──────────────────────────────────────────────────────────
const CONFIG = {
  // GitHub deployment (used for workflow dispatch + status polling)
  GH_OWNER: 'knunnenkamp25',
  GH_REPO: 'ArtemisHera',
  GH_WORKFLOW: 'scrape.yml',

  // PLACEHOLDER — OTS universe Google Sheet.
  // When ready, set OTS_SHEET_ID to the sheet id and the app will load
  // universes from it (sheet must be shared "Anyone with the link can view").
  OTS_SHEET_ID: '',        // e.g. '10rHtX5c2bADEwaozICW86qkEireYHIBY9cQ7U3Jfq4I'
  OTS_SHEET_GID: '0',

  MAX_MANUAL_URLS: 5,      // manual web-scrape page limit

  VOTEVIEW_URLS: [
    'https://voteview.com/static/data/out',
    'https://voteview.polisci.ucla.edu/static/data/out',
  ],
  // Pre-scraped state legislature data lives in the congress-votes repo
  STATE_DATA_BASE: 'https://raw.githubusercontent.com/knunnenkamp25/congress-votes/main/state_data',
};

const CAST_CODES = {1:'Yes',2:'Yes',3:'Yes',4:'No',5:'No',6:'No',7:'Present',8:'Present',9:'Not Voting'};
const PARTY_CODES = {'100':'Democratic','200':'Republican','328':'Independent'};

// ── CORS proxies (battle-tested chain from congress-votes) ─────────────────
const PROXIES = [
  url => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
  url => 'https://corsproxy.io/' + encodeURIComponent(url),
  url => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url),
];

// ── OTS model fallback list (124 models) ───────────────────────────────────
const OTS_FALLBACK = [
  'Generation','Urbanicity','Transit Access','Political Party','Ideology','Veteran',
  'Military Relationship','Home Owners','Home Renters','Dwelling Type',
  'Gun Owners (Consumer Data)','Concealed Carry Permit Holders','Parents (Any Children)',
  'Single Parents','Small Business Owners','Outdoorsman / Conservationists',
  'Likely AB Voter','Party Switcher','ESL Speakers','Household Language',
  'Charitable Donors (Non-Political)','Likely Donors (Political)',
  'Health Care Costs Priority','Pet Owners','Occupation Group','Retired Voters',
  'Religion','Marital Status','Investor','Online Buyer','Reachable - Walkable',
  'Reachable - Digital Phone','Reachable - Cell','Reachable - Landline',
  'Reachable - Mail','Unreachable','Credit Rating','HH Income','Net Worth',
  'Inconsistent Voters','Newly Registered Voters','Movers','News / Media Habits',
  'Independent Women','Independent Men','Suburban Women','Rural Women',
  'Non-College Men','Non-College Women','Education Level','Ethnicity',
  'Ethnicity Subgroup','Near-Retirees (55-64)','Medicare-Eligible (65+)',
  'Multi-Generational Households','Senior Adult in Household',
  'Young Adult in Household','Disability Status','NASCAR / Motorsports Fans',
  'Gamers (PC/Console)','Credit Card User','Frequent Travelers',
  'Politically Engaged','Religious Enthusiasm','Clergy / Religious Workers',
  'College-Age Voters (18-22)','College-Educated Men','College-Educated Women',
  'Construction / Trades Workers','Cross-Primary Voters','Drop-Off Voters',
  'Empty Nesters','Executive / C-Suite','Farmers / Agricultural Workers',
  'Female Veterans','First-Time Voters','Gardeners','High News Intake',
  'Latino Men','Legal Professionals','Off-Year / Odd-Year Voter',
  'Caregiver Household','Vietnam-Era Veterans','Casino / Gambling Interest',
  'Reader','Music Enthusiast','Automotive Enthusiast','Cooking Enthusiast',
  'Home Improvers','Crafter','Sports Fan','Snow Sports','Boating / Sailing',
  'Smoker','Working Women','Reachable - Digital IP','Work From Home / SOHO',
  'Collector','Retail Shopper','Arts Enthusiast','Photography Enthusiast',
  'Movie / Entertainment Fan','Technology Enthusiast','Club Member',
  'Upscale Lifestyle','No Internet / Digital Divide',
  'Parents of School-Age Children (6-17)','Parents of Young Children (0-5)',
  'Sandwich Generation','Teachers / Educators','White Working-Class Voters',
  'Women of Color','Post-9/11 Veterans','Distressed Community Quintile',
  'Neighbor States','Lives in College County','Nearest College Sector',
  'Nearest College Level','Lives in Base County','Joint Base County',
  'Nearest Base Component','USPS Distance Bucket','USPS Extended Hours',
  'County Crime Quintile',
];

// ── OTS model → keyword patterns (vote/bill text matching) ─────────────────
const TOPIC_KEYWORDS = {
  'General Turnout': ['election', 'turnout', 'voting rights', 'voter registration', 'ballot', 'polling', 'franchise', 'suffrage', 'electoral'],
  'Primary Turnout': ['primary', 'primary election', 'caucus', 'nominating', 'runoff'],
  'Likely ABEV Voter': ['absentee', 'early voting', 'mail-in', 'mail ballot', 'vote by mail', 'provisional ballot'],
  'Likely & Has ABEV Voter': ['absentee', 'early voting', 'mail-in', 'mail ballot', 'vote by mail'],
  'Urbanicity': ['urban', 'rural', 'suburban', 'metropolitan', 'inner city', 'housing density', 'zoning', 'land use', 'community development'],
  'Voter Propensity': ['election', 'voting', 'civic engagement', 'voter', 'franchise'],
  'Likely Donors': ['campaign finance', 'political contribution', 'fundraising', 'donor', 'pac', 'super pac', 'citizens united', 'fec'],
  'Likely Activists': ['protest', 'demonstration', 'activism', 'grassroots', 'civil rights', 'civil liberties', 'first amendment', 'free speech', 'petition'],
  'Political Party': ['party', 'partisan', 'bipartisan', 'caucus', 'democratic', 'republican', 'independent'],
  'Military Relationship': ['military', 'armed forces', 'defense', 'pentagon', 'dod', 'troops', 'servicemember', 'national guard', 'reserves', 'deployment', 'base closure'],
  'Veteran': ['veteran', 'va ', 'veterans affairs', 'gi bill', 'vfw', 'disabled veteran', 'ptsd', 'wounded warrior', 'military service'],
  'Pro2A': ['gun', 'firearm', 'second amendment', '2nd amendment', 'weapon', 'ammunition', 'concealed carry', 'background check', 'assault weapon', 'nra', 'atf', 'rifle', 'pistol', 'handgun', 'silencer', 'suppressor', 'bump stock', 'red flag'],
  'Small Biz Owners': ['small business', 'small-business', 'sba', 'entrepreneur', 'startup', 'sole proprietor', 'microloan', 'paycheck protection', 'ppp'],
  'Parents': ['parent', 'child care', 'childcare', 'family leave', 'parental', 'custody', 'adoption', 'foster', 'child tax credit', 'child welfare', 'family'],
  'Kids in Household': ['child', 'children', 'youth', 'juvenile', 'minor', 'pediatric', 'school lunch', 'snap', 'chip', 'head start'],
  'Home Owners': ['homeowner', 'home owner', 'mortgage', 'property tax', 'home equity', 'housing', 'hud', 'fannie mae', 'freddie mac', 'fha', 'real estate'],
  'Home Renters': ['renter', 'tenant', 'rent', 'rental', 'eviction', 'affordable housing', 'section 8', 'housing voucher', 'landlord'],
  'Streaming Only': ['streaming', 'broadband', 'internet access', 'digital divide', 'net neutrality', 'fcc', 'telecommunications', 'cord cutting'],
  'TV Viewer': ['broadcast', 'television', 'tv ', 'cable', 'fcc', 'media', 'spectrum', 'telecommunications'],
  'Word of Month': ['communication', 'misinformation', 'disinformation', 'social media', 'free speech', 'censorship', 'information'],
  'Education': ['education', 'school', 'student', 'college', 'university', 'teacher', 'curriculum', 'tuition', 'student loan', 'pell grant', 'title i', 'stem', 'vocational', 'higher education', 'k-12', 'elementary', 'secondary', 'charter school', 'head start'],
  'NIMBY': ['zoning', 'land use', 'building permit', 'development', 'neighborhood', 'eminent domain', 'infrastructure', 'construction', 'waste', 'landfill', 'pipeline', 'power plant', 'nuclear', 'wind farm', 'solar farm', 'transmission line'],
  'Social Media': ['social media', 'facebook', 'twitter', 'tiktok', 'instagram', 'online platform', 'section 230', 'content moderation', 'algorithm', 'data privacy', 'tech company', 'big tech'],
  'Household Language': ['language', 'bilingual', 'english', 'esl', 'translation', 'interpreter', 'multilingual', 'immigration'],
  'Family Generation': ['generational', 'millennial', 'gen z', 'baby boomer', 'generation x', 'intergenerational', 'aging', 'elderly', 'senior', 'youth'],
  'Generation': ['generational', 'millennial', 'gen z', 'baby boomer', 'generation x', 'senior', 'aging', 'elderly', 'youth', 'retirement'],
  'Prolife': ['abortion', 'pro-life', 'prolife', 'pro life', 'unborn', 'fetus', 'reproductive', 'roe', 'planned parenthood', 'contraception', 'birth control', 'family planning', 'hyde amendment', 'dobbs'],
  'Walkable Households': ['walkability', 'pedestrian', 'sidewalk', 'transit', 'public transit', 'transportation', 'commute', 'bike', 'bicycle', 'urban planning'],
  'Mailable Households': ['postal', 'usps', 'mail', 'mailing', 'post office', 'package', 'delivery', 'shipping'],
  'Cleopatra': ['women', 'woman', 'gender', 'female', 'maternal', 'title ix', 'pay equity', 'equal pay', 'sexual harassment', 'domestic violence', 'violence against women', 'vawa'],
  'Reducing crime': ['crime', 'criminal', 'law enforcement', 'police', 'prison', 'incarceration', 'sentencing', 'recidivism', 'public safety', 'fbi', 'dea', 'drug trafficking', 'gang', 'theft', 'robbery', 'homicide', 'murder', 'assault', 'justice reform', 'bail'],
  'Cost of Living': ['inflation', 'cost of living', 'consumer price', 'cpi', 'gas price', 'fuel cost', 'grocery', 'food price', 'wage', 'minimum wage', 'affordability', 'economic relief', 'price gouging'],
  'Health care costs': ['health care', 'healthcare', 'medical', 'insurance', 'medicaid', 'medicare', 'prescription', 'drug price', 'pharmaceutical', 'hospital', 'affordable care act', 'aca', 'obamacare', 'copay', 'deductible', 'premium', 'public option'],
  'Outdoorsman/Conservationists': ['conservation', 'wildlife', 'hunting', 'fishing', 'forest', 'national park', 'public land', 'endangered species', 'wilderness', 'water quality', 'clean water', 'clean air', 'epa', 'environment', 'climate', 'emission', 'pollution', 'sustainability'],
  'Inconsistent Voters': ['election', 'voter', 'turnout', 'registration', 'ballot access', 'civic'],
  'Trump not midterms': ['midterm', 'election', 'presidential', 'off-year', 'special election'],
  'Economically Stressed': ['poverty', 'unemployment', 'jobless', 'welfare', 'food stamp', 'snap', 'tanf', 'economic hardship', 'housing assistance', 'debt', 'bankruptcy', 'foreclosure', 'eviction', 'homelessness'],
  'Independent Women': ['women', 'woman', 'female', 'gender', 'title ix', 'equal pay', 'reproductive', 'maternal', 'childcare'],
  'Independent Men': ['employment', 'labor', 'trade', 'manufacturing', 'infrastructure', 'job training', 'apprenticeship'],
  'ESL Speakers': ['english', 'esl', 'bilingual', 'language', 'immigration', 'interpreter', 'translation', 'citizenship'],
  'Low News Intake': ['media', 'information', 'literacy', 'news', 'press', 'journalism', 'broadcast'],
  'High News Intake': ['media', 'press', 'journalism', 'broadcast', 'news', 'information', 'foia', 'transparency'],
  'Cablezones': ['cable', 'broadcast', 'spectrum', 'fcc', 'television', 'telecommunications', 'media market'],
  'Likely Survey Taker': ['census', 'survey', 'data collection', 'statistics', 'demographic', 'american community survey'],
  'Ideology': ['ideology', 'conservative', 'liberal', 'progressive', 'moderate', 'bipartisan', 'partisan', 'caucus'],
  'Influencers': ['social media', 'online platform', 'influencer', 'content creator', 'digital', 'internet', 'technology'],
  'Movers': ['relocation', 'moving', 'migration', 'housing', 'census', 'demographic', 'population'],
  'Party Switcher': ['party', 'partisan', 'bipartisan', 'crossover', 'independent', 'realignment', 'moderate'],
};

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

const HERA_PHASES = [
  { id:'define',  name:'Phase 1 — Define',  desc:'Introduce the narrative frame and soften the target with the broadest, highest-severity hits.' },
  { id:'drive',   name:'Phase 2 — Drive',   desc:'Sustained multi-channel pressure. Rotate issue-specific hits against their matched universes.' },
  { id:'close',   name:'Phase 3 — Close',   desc:'Sharpen to the two strongest contrasts. High frequency, GOTV integration, persuasion-to-mobilization handoff.' },
];
