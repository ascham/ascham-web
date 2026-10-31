// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
// Word bands.
// ============================================================
// Which words are worth a flashcard, expressed as the boundary rather than
// the corpus.
//
// THE IDEA THIS FILE EXISTS FOR
// The obvious build ships a 50,000-word frequency table and asks "how rare is
// this word?". That is a megabyte of data answering a question we do not have.
//
// The question we have is binary: is this word worth a card? It is, when the
// word is NOT part of the general service vocabulary a learner already holds,
// or when it IS academic vocabulary that recurs across every subject. So we
// ship only the two lists that define that edge. Everything falling through
// is rare BY CONSTRUCTION, and band 5 therefore costs nothing to store.
//
//   band 1  general service      — never a card
//   band 2  common beyond core   — never a card
//   band 3  upper intermediate   — a card, ~B2
//   band 4  academic             — a card, ~C1
//   band 5  off-list, implied by absence from all four — a card, ~C1+
//
// Bands 2 and 3 were "deliberately absent in the fast ship... a quality
// refinement, not a correctness one", on the reasoning that a false positive
// costs one click. That was measured and it was wrong: without them, 25% of an
// ordinary A2–B1 sample came out band 5, and a teacher deleting a quarter of a
// deck does not conclude the filter is conservative. They were added, and
// "adding them later means appending, not restructuring" turned out to be the
// one part that held.
//
// PROVENANCE, which matters for licensing. NOTICE is the binding statement.
// The lists were compiled for this project and most entries were authored for
// it directly. One batch was not: UP_ORDINARY, in band 3, was imported from
// SCOWL sizes 10 and 20 (its header below says how), and SCOWL's permission
// notice ships in NOTICE. Nothing here is a copy of NGSL, NAWL or Coxhead's
// AWL — those are CC BY-SA, and share-alike reaching a bundled data file is a
// genuine complication for a paid product. Substantial overlap with published
// lists is expected and unavoidable, because all of them describe the same
// language; a copy is a different thing from a convergence. Do not paste a
// published corpus in.
//
// Entries are LEMMAS. Callers look up the output of lemmatise(), never the
// surface form — vocab-core.js owns that step.
//
// An ES module (the web app). The extension loaded it as a classic script and
// published it on `globalThis`; the logic below is unchanged by the move.
// ============================================================

'use strict';

// ------------------------------------------------------------
// BAND 1 — GENERAL SERVICE
//
// Roughly the commonest 1,200 lemmas. Grouped by part of speech so the list
// stays maintainable and so duplicates are visible when one is added; the
// groups are concatenated and order carries no meaning.
// ------------------------------------------------------------

// Determiners, pronouns, prepositions, conjunctions, auxiliaries, and the
// closed classes generally. These are the highest-frequency words in English
// and no learner past their first month needs a card for any of them.
//
// THE COMPOUNDS WERE MISSING AND THE SIMPLE FORMS WERE NOT. `some`, `any`,
// `every`, `no`, `thing`, `one`, `body` and `where` were all here from the
// start; eleven of the sixteen words they build were not, so `everybody` and
// `nothing` went out as ~C1+ flashcards at the top weight in the deck. The
// same for `ought` beside nine other modals, `oneself` beside eight other
// reflexives, and five of the six wh-words in `-ever`. Nothing distinguished
// the missing ones — they are simply what did not get typed.
//
// THE NUMBERS WERE THE SAME HOLE AND THE LINE ABOVE COULD HAVE BEEN WRITTEN
// ABOUT THEM WORD FOR WORD. `twenty` to `fifty` were here and `sixty` to
// `ninety` were not; the teens were absent entirely, and so were 26 of the 29
// ordinals — so `seventeen`, `eighth` and `twentieth` were band 5, which is a
// card at the top weight badged ~C1+. A date, a score or a count in the
// highlighted paragraph was enough. 39 cells.
//
// They are laid out below as the paradigm rather than as a run-on list: units,
// teens, tens, scales, then the ordinals in order. A gap in a column is visible
// on the page, which a wrapped sentence of number words is not — and the way
// this hole survived was that nobody could see the shape of what was missing.
//
// A closed class is now checked as a closed class: logic.test.js builds every
// cell of these six paradigms and fails on any that is not suppressed, so a
// half-written one is a failure rather than an omission nobody notices. The
// numbers are generated there from their own stems, so `thirteen` and
// `fortieth` are asked for by a rule and cannot be forgotten one at a time.
const GS_FUNCTION = `
a an the this that these those each every either neither both all some any
no none other another such same else
something someone somebody anything anyone anybody
everything everyone everybody nothing nobody
i you he she it we they me him her us them my your his its our their mine
yours hers ours theirs myself yourself himself herself itself ourselves
yourselves themselves oneself who whom whose which what where when why how
whoever whatever whenever wherever whichever
and or but nor so yet for because although though unless until while whereas
if then than as since whether
in on at by to from of off up down over under above below through across
into onto out about against among between behind beyond beside during
towards upon with within without along around before after near past
throughout amid amongst despite besides regarding via per plus versus
toward beneath underneath alongside except
be am is are was were been being have has had having do does did doing
will would shall should can could may might must ought cannot
not very too also just only even still already yet again once ever never
always often sometimes usually rarely anymore
there here now then today tomorrow yesterday
one two three four five six seven eight nine ten eleven twelve
thirteen fourteen fifteen sixteen seventeen eighteen nineteen
twenty thirty forty fifty sixty seventy eighty ninety
hundred thousand million billion
first second third fourth fifth sixth seventh eighth ninth tenth
eleventh twelfth thirteenth fourteenth fifteenth sixteenth seventeenth
eighteenth nineteenth twentieth thirtieth fortieth fiftieth sixtieth
seventieth eightieth ninetieth hundredth thousandth millionth billionth
last next
much many more most little less least few several enough plenty
yes ok okay please thank hello goodbye
`;

// The commonest verbs. Lemmas only: the lemmatiser reduces "running",
// "ran" and "runs" to "run" before any lookup happens here.
const GS_VERBS = `
go come get give take make put keep let set send bring carry move turn
say tell ask answer speak talk call mean explain describe suggest agree
know think believe understand remember forget learn teach study read write
see look watch hear listen feel touch smell taste notice seem appear
want need like love hate prefer hope wish choose decide try attempt manage
work play run walk sit stand lie sleep wake eat drink cook clean wash
sing dance jump laugh cry smile reach
live stay leave arrive return visit travel drive ride fly swim climb
buy sell pay cost spend save earn lend borrow owe
open close start begin end finish stop continue wait stay follow lead
help serve support protect save care share join meet marry
build break fix cut hold catch throw pull push lift drop carry
find search seek discover cover hide show
change grow rise fall increase reduce improve develop become remain
happen cause affect result depend include contain consist
allow accept refuse deny admit promise offer invite thank apologise
win lose fight defend attack kill die hurt suffer heal
count measure weigh compare match fit belong own use apply
`;

// Everyday concrete nouns — people, places, objects, time. These are the
// words a reader meets outside any subject, which is precisely why they are
// not worth a card.
const GS_NOUNS = `
man woman child boy girl baby person people family parent mother father
son daughter brother sister husband wife friend neighbour guest stranger
teacher student doctor nurse worker farmer driver officer soldier artist
writer singer player leader member owner customer citizen
head face eye ear nose mouth tooth hair neck arm hand finger leg foot
body heart blood bone skin voice mind brain
house home room door window wall floor roof kitchen garden yard building
school college university office shop store market bank hospital church
street road city town village country state world earth land sea river
mountain hill forest tree flower grass field beach island sky sun moon star
water fire air wind rain snow ice weather season summer winter spring autumn
day night morning evening afternoon week month year hour minute time moment
weekend place idea
january february march april may june july august september october november
december monday tuesday wednesday thursday friday saturday sunday
food bread meat fish egg milk cheese fruit apple vegetable rice sugar salt
meal breakfast lunch dinner coffee tea drink glass cup plate bowl knife
clothes shirt dress shoe hat coat bag pocket
car bus train plane boat ship bike road ticket travel journey trip
book paper page letter word line story news picture film music song game art
money price cost bill coin card tax wage job work business company
number part piece half side end top bottom front back middle corner
thing stuff kind sort type way manner reason result answer question problem
name age life death health illness pain rest sleep dream
group team club party class course lesson test exam mark degree
government law rule right power war peace army police court prison
`;

// Adjectives and adverbs of the everyday register.
const GS_MODIFIERS = `
good bad better best worse worst great fine nice lovely awful terrible
big large small little tiny huge wide narrow thick thin deep shallow
long short tall high low near far close distant
new old young ancient modern recent early late fast quick slow
hot warm cool cold dry wet clean dirty fresh dark bright
easy hard difficult simple complex clear plain obvious strange odd
strong weak heavy light soft rough smooth sharp
happy sad angry afraid glad sorry tired hungry thirsty sick well
rich poor cheap expensive free busy quiet loud
right wrong true false real fake certain sure possible impossible
full empty open closed ready done finished
red blue green yellow black white brown grey pink orange purple
important useful helpful careful dangerous safe serious funny
above below inside outside forward backward together apart aside alone soon
almost nearly quite rather really truly perhaps maybe probably certainly
however therefore besides otherwise instead anyway anyhow meanwhile
`;

// The everyday register of news and public life. This group earns its place by
// what it PREVENTS: a teacher assigning a news article would otherwise meet
// "minister", "election" and "percent" as card candidates, and every one of
// those is a false positive that costs them a click. Words here are common in
// journalism without being academic — anything that carries a writer's stance
// or belongs to the vocabulary of argument stays in band 4 instead.
const GS_PUBLIC = `
report statement announce release publish note add state comment
official minister president governor mayor council committee board agency
department ministry authority organisation association union
election vote voter campaign candidate poll ballot seat majority minority
public private national international global local regional
system service programme project plan scheme
issue case point fact matter event situation condition term
example instance figure rate level amount total average percent
effect impact risk chance opportunity benefit cost
company firm market trade product customer consumer price
study expert scientist researcher university
number million billion thousand percentage
main major minor key central basic general common special particular
specific various different similar individual single whole entire
current former latest previous recent modern
able likely unlikely possible probable
provide require involve remain appear consider expect
increase decrease reduce raise lower
according following despite regarding concerning
community society resident citizen
health medical treatment disease patient hospital
energy power fuel oil gas electricity climate
technology computer software internet network digital online
`;

// Gaps found by running real passages through harvest() and reading what came
// out. Every word here was a false positive on a live text before it was
// added — this group is a log of what the tool actually got wrong, which makes
// it the most honest of the five and the one to extend first.
//
// The last two lines came from a BBC news article, the first live text a
// teacher put through the tool. Note what they have in common: "born",
// "foreign", "birth", "shot" are all short, concrete and ordinary, and all
// fell through because the band stops around rank 1,000 while ordinary
// vocabulary carries on to about 3,000. Adding them one article at a time
// closes the holes that were hit, not the holes that exist — the real fix is
// the wider band, and these are here to stop the bleeding until it lands.
const GS_GAPS = `
draw drawn practice politics political critic criticise boundary border
district region area zone limit edge margin
demand deny reply respond react accord regard concern
turnout attend attendance absence presence
affect effect influence pressure force strain
choice option alternative decision judgement
worker employer employee staff colleague
speech language word phrase sentence text version
measure amount degree scale range extent
debate discuss dispute agreement tire
rule govern control manage direct order command
protect defence attack threat danger warning
supply demand market share stake profit loss
sign born birth foreign federal shot existing repeatedly advantage
hotel colour sport noisy famous correct
`;

// ------------------------------------------------------------
// BAND 2 — COMMON, BEYOND THE CORE
//
// Never a card, same as band 1. The split exists because band 1 is the closed
// classes and the first thousand lemmas — the words a learner has by the end
// of their first year — and this is the next two thousand, which they also
// have by the time anyone hands them a news article.
//
// THIS BAND IS THE ONE THE PRODUCT WAS MISSING, and it was expensive. Before
// it, "born", "foreign", "birth", "advantage", "hotel" and "famous" were all
// band 5 — "rare BY CONSTRUCTION" — and were being offered to a teacher as
// vocabulary worth teaching. A sample of ordinary A2–B1 words measured 25%
// false-rare. The band edge sat at about rank 1,000 while ordinary English
// carries on to about 3,000, and everything in the gap was being called rare
// because the list simply stopped.
//
// Band 5 remains the absence of an entry, so this band costs its own bytes and
// nothing else.
// ------------------------------------------------------------

const CM_VERBS = `
admire advise afford arrange arrest attach avoid bake base bear beat beg
behave bend bet bite blame blow boil bother bounce breathe breed burn burst
bury calculate cancel capture celebrate challenge charge chase chat cheat
check cheer chew chop clap click collect combine comfort commit communicate
compete complain complete concentrate confess confuse connect consult consume
contact contribute convince cope copy cough crash crawl creep cross crush cure
damage dare deal decorate defeat define delay deliver depart deserve design
destroy detect determine differ dig disagree disappear disappoint dismiss
display divide donate doubt drag educate elect employ
encourage engage enjoy ensure enter entertain escape estimate exchange excite
excuse exercise exist expand experience explode explore export express extend
fail fasten favour fear feed fetch fill flee float flow
fold forgive form freeze frighten gain gather glance grab greet grin grip
guard guess guide hammer handle hang harm heat hesitate hire hit hop hug hunt
hurry identify ignore imagine imitate impress inform injure insist inspect
inspire install insult intend interest interrupt introduce invent iron joke
judge justify kick kiss kneel knock label lack launch lay lean leap lick
link list lock log melt mend mention miss mix murder nod obey
object occupy offend oppose organise overcome pack paint park participate pass
paste pause perform permit persuade phone pick pin plant plug
poison polish pop possess post pour practise praise pray predict prepare
present preserve press pretend prevent print produce progress pronounce
protest prove pump punch punish purchase pursue qualify queue quit race rank
realise recall receive recognise recommend record recover recycle refer
reflect regret reject relax rely remind remove rent repair repeat replace
represent request rescue resign resist respect restore retire review
reward ring rob roll rub ruin rush sail satisfy scan scare scatter scream
screw secure seize select separate settle sew shake shape shave shift
shine shock shoot shout shrink shut sigh signal sink sip skip slice
slide slip smash smoke sneeze sniff solve sound spare spell spill spin
spit split spoil spot spray spread squeeze stamp stare starve steal steer
stick sting stir stretch strike stroke struggle submit succeed
suck suit suppose surprise surround survive suspect swallow swear sweep swell
swing switch tap tear tease tend threaten tick tidy tie tip trace
transfer translate transport trap treat tremble trick trust tune
twist unite unlock update upset urge vary wander warn waste wave weaken
wear weep welcome whisper whistle widen wipe wonder worry wound wrap
wreck yell zip
`;

const CM_NOUNS = `
accident actor address adult advert advice aim airport alarm
ambulance animal ankle apartment appointment
arrow article aunt author background bacon balcony ball
balloon band bandage bar basket bath battery battle bean bear beard
bed bedroom bee beef beer bell belt bench bicycle bin bird birthday
biscuit blanket blouse bomb bonus boot boss
bottle box branch brand breath brick bridge
brush bucket bug bullet bush butter button cabbage cabin cake calendar
camera camp candle cap captain career carpet carrot cartoon
cash castle cat ceiling cell cent centre century chain chair chalk champion
chapter charity cheek chef chemist cherry chest chicken chief
chimney chin chocolate cigarette cinema circle circus clerk
cliff clinic clock cloth cloud clue coach coal coast
collar comb comedy comfort
competition concert conference confidence
conversation copy cotton cough countryside couple courage
cousin cow crack cream credit crew crime crowd crown cupboard curtain
cushion custom cycle date deal debt decade
delay dentist departure design desk dessert detail
detective diamond diary diet difference direction dirt disaster
discount dish distance document dog doll dollar
donkey dot doubt dozen drug drum duck dust duty
eagle east economics education effort elephant
electronics email emergency enemy engine engineer entrance envelope
equipment error escape estate exchange excuse
exercise exhibition exit expense experience experiment explosion
factory failure fame farm fashion fault favour fear feather fee
feeling fence festival fever file
flag flame flat flight flour flu fog folder football fork
form fortune fountain fox frame freedom fridge friendship frog fun
funeral fur furniture future gallery gang gap garage gate
gift ginger glove goal goat gold golf goose grade grain grammar
grandfather grandmother grape gravity grocery ground growth guard
guide guitar gun habit hall hammer handle happiness harbour harvest
headache heat hedge heel height helicopter helmet hero
hobby hole holiday honey honour hook horn horse host
housing human humour hunger hunter hurricane
image imagination income infection information injury
ink insect instrument insurance interest interview invitation iron
jacket jam jar jaw jazz jeans jelly jewel joke joy judge
juice jungle justice keyboard kid kilometre king kiss kite knee
knot knowledge lab label lace ladder lake lamb lamp laptop
laughter laundry lawn lawyer layer leaf leather lecture legend lemon
length library lid lightning lily limb
lion lip liquid list literature litter loan lock log logic loop lorry
lot luck luggage lung machine magazine magic mail manager map
marble marriage material mathematics
meaning medal medicine meeting melody memory
menu message metal metre microphone midnight mile mill
mineral mirror mission mistake mixture model monkey monster
monument mood mosquito motor motorway mouse moustache
movement movie mud muscle museum mushroom musician mystery nail
napkin nation nature needle nephew nerve nest net
newspaper niece nightmare noise noon north notebook
nut oak object ocean onion opera opinion
orchestra organ oxygen packet
paint painting pair palace pan pancake panic parade parcel park
parrot partner passenger passport path pattern
pavement payment peach pear pearl pen pencil penny pepper
performance perfume period permission pet petrol phone photo
piano picnic pig pigeon pile pill pillow pilot pin pine
pipe pitch pity pizza planet plant plastic platform
pleasure plot plug poem poet poison
polish pond pool pork port portrait position post postcard poster
pot potato pound powder prayer present press
pride priest prince princess print prize
producer professor progress
proof property protest pub pudding pump punishment
pupil puppy purpose purse puzzle pyramid quality quantity quarter queen
queue quiz rabbit race radio rail railway rainbow rank
ratio reaction reader reality receipt recipe record recording reference
refrigerator register relative religion rent repair
reporter republic reputation request rescue reservation
resource respect response responsibility restaurant reward
rhythm ribbon riddle ring robot rock rocket role
root rope rose route row royal rubber rubbish rugby ruler rumour
sacrifice saddle safety sail salad salary sale sand sandwich satellite
sauce sausage scarf scene schedule science scissors
score screen screw sculpture seafood secret
secretary section security seed selection self senate sense series
servant session shade shadow shame shampoo shape shark sheep
sheet shelf shell shelter shock shore shorts shoulder
shower sight signal signature silence silk silver sink
site size skill skirt slave slice slope
smoke snack snake soap sock sofa soil
solution soul soup source south space spade speaker speed
spelling spider spirit spoon spot square stadium stage
stair stamp standard station statue steam steel
step stick stomach stone storm stove strategy straw
stream strength stress string studio
style subject substance suburb subway success suit suitcase summary
supermarket supper surface surgeon surprise
sweater sweet swimming switch symbol sympathy table tablet tail
talent tank tap tape target task taxi
tear teenager telephone television temperature temple
tendency tennis tension tent terminal territory theatre theme
thief thought thread throat thumb thunder tide tie tiger
timber timetable tin tip tissue title toast tobacco toe toilet tomato
tone tongue tonne tool topic tour tourist towel tower
toy track tractor tradition traffic trail transport trap
tray treasure trend trial triangle trick trolley trouble
trousers truck trumpet trunk trust truth tube tunnel turkey twin
tyre umbrella uncle uniform unit universe valley van
vehicle victim victory video view vinegar violin
virus vision visitor vocabulary volume voyage waist
waiter wallet wardrobe warmth waste wave
wax weakness wealth weapon web wedding weight
welcome west wheat wheel whistle wildlife wine wing
winner wire wisdom wolf wood wool worm
worry wound wrist yawn yoghurt youth zebra zoo
dawn faith ray jack definition ban
`;

const CM_MODIFIERS = `
absent active actual alive amazing annual anxious
asleep automatic available awake aware bare beautiful
bitter blind boring brave brief brilliant broad broken
calm capable careless casual cheerful chief civil classic
clever cloudy comfortable complete complicated confident confused
conscious constant convenient crazy creative crisp critical cruel
curious curly cute daily damp deaf dear delicious dependent desperate detailed
disabled domestic double dramatic dull dusty eager
eastern educational efficient elderly electric electronic elegant embarrassed
emotional enormous equal everyday exact
excellent excited exciting exhausted experienced extra extreme fair
faithful familiar fancy fantastic favourite female fierce
final flat flexible fluent foggy fond foolish
formal fortunate frequent friendly frozen furious future
generous gentle gifted glorious golden gorgeous gradual
grateful guilty handsome harmful healthy helpless hidden historic hollow
honest horrible humble humid ideal identical idle
ignorant ill illegal immediate immense impatient impressive incredible
independent indoor infinite informal innocent instant
intelligent intense interesting internal invisible jealous
joint jolly junior keen known lame lazy leading legal lengthy
lifelong liquid literary lively lonely loose
loyal lucky mad magic magnetic male manual married massive mature
maximum medieval mental mild military minimum
miserable mobile moderate modest moral mysterious nasty
native natural naughty naval nearby neat necessary negative nervous neutral
noble normal northern notable noticeable nuclear numerous obedient
opposite optimistic ordinary organic original
outdoor outer outstanding overall overseas painful pale partial
passive peaceful perfect permanent personal physical
pleasant pleased plentiful polite popular positive potential
powerful practical precious precise pregnant present pretty primary
prime principal professional profitable progressive
prominent proper protective proud pure qualified rapid
rare raw realistic reasonable regular relaxed
religious reluctant remarkable remote responsible ridiculous romantic rotten
round royal rude sacred salty satisfied scared
scientific secondary secret secure selfish senior sensible sensitive
severe shiny shocked shocking silent silly silver
sincere skilful sleepy slight slim slippery smart
social solar solid sore sour southern spare spicy spiritual
splendid spoken sporting spotty square stable steady steep sticky stiff
straight strict striking stunning stupid sudden suitable sunny
super superb supreme surprised surrounding suspicious sweet swift
talented tasty technical temporary tender tense terrific
thankful thorough thoughtful thrilling tidy tight
tough traditional tragic tremendous tribal tricky tropical
troubled typical ugly unable uncomfortable unconscious underground
unfair unfortunate unhappy unique united universal unknown unlucky unnecessary
unpleasant unusual upper upset upstairs urgent used useless usual
vacant vague valuable vast verbal vertical vicious violent virtual
visible visual vital vivid vocal voluntary wealthy weekly weird
western wicked wild willing windy wise wonderful
wooden woollen worldwide worried worth yearly
`;

const CM_ADVERBS = `
abroad absolutely actually afterwards ahead aloud alternatively
anywhere apparently approximately automatically away backwards badly barely
briefly broadly carefully clearly closely completely constantly
correctly currently daily deeply definitely deliberately differently
directly downstairs easily elsewhere entirely equally especially eventually
everywhere exactly extremely fairly finally firmly forever formerly fortunately
frankly freely frequently fully generally gently gradually greatly hardly
heavily highly honestly hopefully immediately increasingly indeed initially
instantly largely lately lightly literally loudly luckily mainly merely
mostly mutually naturally nearby necessarily normally nowhere obviously
occasionally onwards openly originally overseas partly personally physically
plainly politely poorly possibly practically precisely presently previously
primarily properly publicly purely quickly quietly rapidly readily
recently regularly relatively roughly safely seriously severely
sharply shortly significantly simply sincerely slightly slowly smoothly
socially solely somehow somewhat somewhere specially steadily strictly
strongly successfully suddenly surely surprisingly swiftly thoroughly
thus tightly totally traditionally typically undoubtedly unfortunately
upstairs upwards usefully utterly virtually visually widely willingly wisely
worldwide
`;

// DERIVED FORMS, WHOSE ABSENCE WAS THE SINGLE LARGEST SOURCE OF BAD CARDS.
//
// `discuss` was band 1 and `discussion` was band 5. `criticise` band 1,
// `criticism` band 5. `politics` band 1, `politician` band 5. `inside` band 1,
// `insider` band 5. Every one of those shipped as a flashcard off a real
// newspaper article, and they were not edge cases: a 633-word
// probe of ordinary derived nouns found 435 of them band 5. Whole suffixes were
// missing — 39 of 43 `-ness` nouns, 85 of 104 agent `-er`/`-or` nouns.
//
// THE LEMMATISER CANNOT FIX THIS AND MUST NOT BE ASKED TO. Stripping `-ion`
// only reaches the derived form whose base survives the strip intact:
// `discussion` gives `discuss`, but `decision` gives `decis` and `politician`
// gives `politic`, and no amount of rule-writing turns those into `decide` and
// `politics`. A lemmatiser change also moves every word in the language at
// once, which is how `speed` became `spe`. A list moves exactly what it names.
//
// THE SPLIT BETWEEN THIS BAND AND BAND 3 IS TRANSPARENCY OF MEANING. A derived
// word belongs here when a learner holding the base can read it without being
// taught: `dark` -> `darkness`, `agree` -> `agreement`, `sing` -> `singer`. It
// belongs in band 3 when the morphology is transparent but the sense is not —
// `inside` does not give you `insider`, `offend` does not give you the legal
// register of `offender`. The first pass was mechanical (strip the suffix, ask
// whether the base is band 1 or 2) and the second was by hand, because
// transparency is a fact about meaning and the machine only sees spelling.
//
// Placement is checked, not asserted by comment: logic.test.js requires every
// entry here to have a base in band 1 or 2 under the same suffix rules, or to
// appear in a named exception list.
const CM_DERIVED = `
ability acceptance achievement activism activist activity addition adjustment
admission adulthood adviser advertisement amazement amusement announcement
announcer appearance application approval arrangement arrival assessment
assignment assistance attachment attacker attention attraction audience
availability awareness balance banker basement beginner believer blindness
brightness broadcaster builder burial buyer calmness campaigner capability
carer celebration celebrity childhood citizenship civilian cleaner cleverness
closure coldness collection combination comedian commitment communication
competence competitor composer conductor confusion connection consideration
construction container contribution cooperation coverage creation creativity
criticism culture curiosity cyclist dancer darkness deadline dealer
decoration demonstration denial description designer destruction detection
determination developer development difficulty director disability
disagreement disappearance disappointment discussion distribution division
donation economist edition editor effectiveness electrician emotion emptiness
encouragement engagement enjoyment entertainment environment equality
examiner excitement exception existence expansion expectation explanation
exploration expression extension extremism extremist fairness familiarity
feature fighter fitness flexibility follower formality formation foundation
founder freshness friendliness gardener generation gentleness goodness
graduation guidance hardness headline helper historian holder honesty
hospitality humanity humidity identity ignorance illustration importance
impression improvement independence indication injection inspection inspector
inspiration instruction instructor intelligence intention interruption
introduction invention inventor investigation investigator
investor involvement journalism journalist killer kindness laziness
leadership learner lecturer librarian licence limitation listener location
loneliness madness magician maker management marker mathematician maturity
measurement membership messenger mileage morality motherhood motivation
murderer nationalism nationalist nationality neighbourhood nervousness
objection observer occupation openness operation operator opposition
organiser originality ownership package painter parenthood participation
partnership passage performer personality photographer placement planner
politeness politician pollution popularity population possession
possibility prediction
preference preparation presentation presenter preservation prevention
printer priority prisoner probability production profession programmer
promotion pronunciation proposal protection publication publicity publisher
qualification racism racist readiness realism receiver recognition
relationship
recommendation recorder reduction reflection refusal registration reliance
reminder removal rental replacement requirement resistance retirement
revolution richness sadness satisfaction seller separation seriousness
settlement shopper shortage sickness similarity simplicity sincerity
sleepiness socialism socialist softness specialist spokesman spokesperson
spokeswoman sponsor stability storage stupidity subscriber subscription
suggestion supervisor supplier supporter survival survivor sweetness
technician terrorism terrorist thickness tiredness tourism trainer
translation translator transportation traveller ugliness usage usefulness
variation variety viewer violence violinist visibility walker watcher
willingness wreckage
`;

// THE SAME HOLE AS CM_DERIVED, READ FROM THE OTHER END. There a derived word
// was band 5 under a band-1 base. Here the BASE is band 5 under a banded
// DERIVATIVE: `association` was band 1 and `associate` was in no list at all,
// `effectiveness` band 2 over `effective`, `successfully` over `successful`.
// A probe peeling the ten suffixes whose base survives the strip intact found
// 98 such bases; 57 are kept, here and in UP_BASES. The other 41
// are what mechanical peeling invents — `quest` under `question`, `morale`
// under `morality`, `wilder` under `wilderness` — and are named one at a time
// in logic.test.js, so the review can be audited rather than believed.
//
// THE LEMMATISER PAYS FOR THIS TWICE, WITH NO RULE CHANGED. reduce() offers
// [undoubled, stem+'e', stem] to isKnown and takes the first hit, and
// foldSilentE drops a final -e from any spelling no list holds. So `declare`
// reduced to `declar`, and `declared`, `declares` and `declaring` with it: an
// ordinary verb arriving as a ~C1+ card at weight 3.0, ABOVE every word that
// lemmatised correctly. A band entry is what answers isKnown: 35 of these 57
// had their BARE form truncated that way, and of their 131 real inflections 83
// were reaching a non-word. No rule changed; the list is the whole repair.
//
// Band 2 here and band 3 in UP_BASES by CM_DERIVED's transparency test run
// backwards: the base belongs here when the derivative gives you its meaning.
const CM_BASES = `
absolute advertise amaze amuse approximate associate attract complicate
construct cooperate declare definite effective equip exhibit graduate
homeless hopeful infect inject insecure instruct locate motivate mutual
occasional pollute productive recruit relate reserve successful
`;

// The bulk of the band-4 reclassification — see the note above
// GS_FROM_ACADEMIC. These are the words a reader meets in a newspaper without
// noticing them, and every one was shipping as vocabulary worth teaching.
const CM_FROM_ACADEMIC = `
adapt adjust administration approach argument aspect bias category
commercial component conclude conclusion confirm consequence context
contrast convert correspond data decline deliberate democracy democratic
demonstrate dimension economic economy element emerge employment
environmental establish eventual evidence examine factor finance financial
function generate indicate industrial industry initial invest investigate
investment labour maintain method objective observation observe obtain occur
operate parallel policy prior procedure process promote propose relation
relevant reliable research restrict reveal revise sequence significant
structure sufficient survey technique theory transform trigger ultimate
unemployment valid
`;

// ORDINARY WORDS THAT ARE ALSO PLACES OR NATIONALITIES.
//
// These earned a band because the PLACE_NAMES and DEMONYMS lists below were
// about to suppress them. That order is the whole lesson of `frank`, recorded
// above AMBIGUOUS_NAMES: adding a proper noun without first asking whether the
// spelling is also a word is how a teachable word disappears with no gesture
// that recovers it.
//
// A band here settles BOTH senses at once and the proper-noun list is never
// consulted, because it is asked only about band 5. "Fine china" and the
// People's Republic get the same answer, and it is the right one for each: a
// learner has `china` and `pole`, so neither is a card.
const CM_HOMOGRAPHS = `
china pole
`;

// THE FOUR POINTS BETWEEN THE FOUR POINTS.
//
// Added off a REAL EXPORTED DECK rather than off a fixture.
// The France Wikipedia deck is 27 cards and THREE of them are
// `northeast`, `northwest` and `southeast` — all from one sentence listing
// which country borders France on which side, all at band 5, which is weight
// 3.0 and the top of the deck. A teacher opening that deck is shown the
// compass as ~C1+ vocabulary, three times, above `annexed` and `feudal`.
//
// THE LIST HAD ALREADY RULED ON THIS SET AND STOPPED HALFWAY. `north`, `south`,
// `east` and `west` are band 2 in CM_NOUNS and `northern`, `southern`,
// `eastern` and `western` are band 2 in CM_MODIFIERS. Those are the only forms
// it keeps — `northerly`, `northward`, `northerner` and `northernmost` are all
// band 5 for the CARDINAL points too, so the policy is consistent and this
// group mirrors it exactly: the point and its -ern adjective, and nothing
// else. Nothing new is being decided here. `northeast` cannot be four bands
// rarer than both of the words it is made of.
//
// EIGHT RATHER THAN THE FOUR THAT ARE ATTESTED, and the set is why. Measured
// over every piece of real text in reach — the saved `English language —
// Wikipedia` page, the three fixtures and the France deck — `southeast` occurs
// 6 times, `northwest` 4, `northeast` 1 and `northeastern` 1; the other four
// occur zero times. Shipping only the attested half would leave a deck able to
// decline `southeast` and card `southwest` out of the same sentence, which is
// a worse defect than the one being fixed and would read as a bug rather than
// as a judgement. The evidence here justifies the SET; the members follow it.
//
// AND IT IS DATA BECAUSE THE RULE WAS MEASURED AND IS WRONG. The tempting
// version of this is automatic: split a band-5 word, and if both halves are
// banded common words, demote it. Run over the 4,117 distinct forms in that
// real text it proposes 47 words, and the list is mostly wreckage — names
// (`norman`, `blackwell`, `campbell`, `longman`, `pearson`, `newcastle`),
// inflections that split by accident (`occurred` = occur + red, `referred`,
// `centring` = cent + ring, `withdrawn`) and genuinely advanced vocabulary
// that happens to be transparent (`intonation`, `voiceless`, `loanword`,
// `heartland`, `commonwealth`). Every one of those would stop being a card.
// So the sweep is a CANDIDATE GENERATOR for a review, which is the same thing
// the band-candidate script was for SCOWL, and never a rule.
//
// The other closed sets the same sweep found holes in are NOT here, for the
// reason everything in this tree is held back: `trillion` beside `billion`,
// `grandparent` beside `grandmother`, `litre` and `gram` beside `metre` and
// `kilometre`, `violet` beside the other eleven colours, `millennium` beside
// `century`. Not one of them occurs in any real text this repository holds.
// Each has a band already chosen for it, so the next pass over this set starts
// from the measurement instead of from the hunch.
const CM_COMPASS = `
northeast northwest southeast southwest
northeastern northwestern southeastern southwestern
`;

const CM_GROUPS = [
  CM_VERBS, CM_NOUNS, CM_MODIFIERS, CM_ADVERBS, CM_DERIVED, CM_BASES,
  CM_FROM_ACADEMIC, CM_HOMOGRAPHS, CM_COMPASS
];

// ------------------------------------------------------------
// BAND 3 — UPPER INTERMEDIATE
//
// A card, and the first band that is one. These are words an upper-intermediate
// reader meets in serious journalism and does not reliably hold: not academic
// register, which is band 4's job, but not everyday either.
//
// The line between this and band 2 is a judgement and will always be arguable.
// It resolves the same way every other tie in this file does — the recoverable
// error wins. A word wrongly here reaches the review table and costs one click;
// a word wrongly in band 2 is silently withheld and the teacher never learns it
// was a candidate. So when in doubt, band 3.
// ------------------------------------------------------------

const UP_VERBS = `
abandon accompany accumulate accuse acknowledge adhere administer
allege allocate anticipate appoint appreciate approve assemble assign assume
assure attribute authorise blend boost breach broaden certify cite clarify
collapse commence compel compensate compile comply compose comprehend
compromise conceal conceive conduct confine confront
consolidate contemplate convey convict coordinate counter cultivate
curb deceive dedicate deem defer delegate denounce depict deploy deprive
designate devise devote diagnose dilute disclose
discourage dispatch disperse displace disrupt dissolve distort distribute
diverge dominate dwell elaborate elicit embrace emphasise enact encounter
endure enrich entail envisage erode evade evoke exceed exclude exempt
exert exhaust expel exploit extract fabricate flourish forfeit formulate
foster fulfil grant halt harness heighten hinder illuminate impair implement
incur inhabit inhibit initiate innovate inquire inscribe insert
intervene invoke isolate lament linger litigate magnify mandate marginalise
mediate mitigate mobilise monitor narrate negotiate nominate nurture obscure
offset omit outline outweigh overhaul override oversee overturn penetrate
perceive persist pertain pinpoint pioneer plunge portray postpone precede
preclude prescribe prevail proclaim prohibit prolong prompt provoke purport
quantify ratify reassure rebuild reconcile rectify redeem refine refrain
regenerate reinforce reiterate relinquish render renounce repeal replicate
reproduce resemble reside resolve resort retain retrieve revert revoke ridicule
safeguard sanction scrap segregate simulate solicit specify speculate stabilise sue
stem stimulate stipulate streamline subdue subsidise summon supersede supplement
suppress surge surpass suspend tackle tailor terminate testify thrive tolerate
transcend transmit undergo undermine underpin undertake unveil uphold utilise
venture waive warrant wield withdraw withhold witness
yield
`;

const UP_NOUNS = `
accusation adversary aesthetics aftermath allegation alliance ambition
amendment analogy anomaly anxiety appeal apparatus appetite architecture
arena aspiration assertion asylum attribute audit autonomy backlash barrier
basis beneficiary bid blueprint breach breakthrough burden bureau
cabinet calibre capacity casualty caution ceasefire
census charter clause coalition cohort collateral commodity compensation
complexity compliance concession conflict consensus consent consortium
conspiracy consumption contingency controversy convention conviction corridor
coup covenant credibility crisis curriculum custody deadlock
default delegation deliberation demise deployment deterrent devotion
dilemma diplomacy directive disclosure discourse discretion disparity
dissent doctrine dossier downturn drought dynamic dynamics edict embargo
endeavour endorsement entity envoy epidemic equity espionage ethic ethics
ethos exemption
exposure fabric faction fallout famine fatigue feasibility
forecast forum franchise fraud fringe frontier gauge genocide
grievance guideline hallmark hardship hazard heritage horizon
hostility hurdle ideology impasse impetus imprint incentive incident
inclination indictment inequality inflation influx initiative
injunction innovation inquest insight insistence installation instinct
integrity intensity interim interval intervention intricacy inventory
irony judiciary landmark legacy legitimacy leverage
likelihood lobby locality longevity loophole magnitude mandate manifesto
manoeuvre mediation memorandum merger metaphor milestone militia
misconduct mobility momentum monopoly moratorium mortality motive mystique
narrative negligence nomination notion obligation offset onset
onslaught outbreak outcome outlet outlook output outrage overhaul oversight
paradox parliament partition patronage penalty perception peril perimeter
persuasion petition pinnacle pledge plight polarity portfolio posture
precedent precinct predicament premise premium prerogative prestige
presumption pretext prevalence privilege probe proceeds proceeding
proclamation profile projection proliferation prominence propaganda
proportion proposition prosecution prospect protocol province provision
proximity quandary quota ramification rationale realm rebellion recession
reciprocity reckoning recruitment redress referendum refuge regime remnant
render repercussion reprisal resentment reservoir residue resolution
restraint retaliation retreat rhetoric rift rigour rivalry roster sanctuary
scandal scarcity scepticism sentiment setback severity siege
solidarity spectrum sphere stalemate stance standstill stature stigma
stimulus stipulation stronghold subsidy successor summit surplus surveillance
susceptibility sustenance syndicate synthesis tariff tenure terrain threshold
tolerance transaction transition transparency treaty tribunal tribute
turmoil unrest upheaval upsurge vacuum validity vantage variance grace dean
venture verdict veto vicinity vigilance vigour vindication virtue volatility
warrant watershed
`;

const UP_MODIFIERS = `
abrupt abundant acute adamant adjacent adverse aesthetic affluent alleged
ambitious amicable ample analytical anonymous archaic ardent articulate
astute audacious authentic autonomous belated benign bilateral blatant
bleak bold brisk candid chronic civic coherent cohesive collective colossal
commendable compelling competent complementary comprehensive compulsory
concise concurrent conducive confidential congenial conservative consistent
contemporary contingent continual
conventional coordinated corporate credible crucial cumulative cynical
decisive defiant deficient definitive demanding derelict detrimental devout
diligent diminutive discreet disparate disproportionate distinctive diverse
divisive dormant drastic dubious durable dynamic eccentric eclectic elaborate
eligible eloquent elusive eminent enduring energetic enthusiastic
equitable erratic essential ethical exhaustive exemplary exhaustive exotic
expansive expedient exquisite extensive extravagant fatal
fervent finite flawed fleeting fluctuating formidable fragile fragmented
frantic frivolous frugal futile generic genuine grim gruelling frank
hazardous hectic heterogeneous hostile humane hypothetical illicit imminent
impartial impending imperative implausible inaccessible inadequate
inaugural incidental incompatible inconsistent indefinite indigenous
indispensable inevitable inexorable infamous inflammatory influential
ingenious innovative insufficient integral intensive intermittent
intricate irreversible lucrative lavish legitimate lenient lethal
liberal lingering literal ludicrous lukewarm malicious mandatory
marginal marked meagre meaningful meticulous mundane naive
nominal notorious novel nuanced obsolete obstinate ominous onerous
opaque optimal orthodox outdated overt overwhelming palpable paramount
partisan pending perpetual persistent pertinent pervasive pivotal poignant
potent pragmatic precarious preliminary premature prerequisite
prestigious pristine profound prolific pronounced provisional
prudent punitive rampant rational reciprocal reckless redundant relentless
resilient resolute restrictive retrospective rigid rigorous
robust rudimentary ruthless salient scarce scathing seamless secular
selective sensational sequential sheer simultaneous singular sober sophisticated
sporadic staggering stark static staunch sterile stern strategic
stringent subordinate subtle succinct superficial superfluous
susceptible sweeping systematic tangible tentative tenuous thriving
transient transitional turbulent unanimous unconditional undue unilateral
unprecedented unrelenting unresolved unwarranted utmost vehement versatile
vibrant vigilant vulnerable warranted wilful
`;

// Band 1 splits its adverbs from its modifiers and so does band 2, and band 3
// simply had nowhere to put one — UP_MODIFIERS above is adjectives without
// exception. So `hence`, `likewise` and `seldom` sat off the bands entirely,
// which made them ~C1+ cards at weight 3.0, above every band-3 word they
// belong beside.
//
// This band and not band 1, on the precedent set by UP_FROM_ACADEMIC below:
// `albeit`, `nonetheless`, `nevertheless`, `moreover` and `furthermore` were
// argued out of INVARIANT 3's sample by name and put here, on the grounds that
// they are the formal register of written argument and a teacher assigning an
// editorial has a real use for them. These three are the same register and get
// the same answer — still a card, at ~B2 rather than ~C1+.
const UP_ADVERBS = `
hence likewise seldom
`;

// The other side of the split described above CM_DERIVED. These are derived
// too, and a learner who has the base still cannot read them: `insider` and
// `outsider` are not people who are inside and outside, `takeover`, `crackdown`
// and `standoff` are not what their two halves say, and `offender`, `residence`
// and `remainder` carry a register their bases do not.
//
// So they stay cards. That is the same asymmetry bandOf() is built on, applied
// one level down: a derived word wrongly shown costs the teacher one click and
// they saw why, and a derived word wrongly filed under "they already have this"
// is withheld from a deck about exactly the article that used it.
const UP_DERIVED = `
appreciation bystander capitalism capitalist clarity coincidence columnist
communism communist complication conservatism contractor convenience
correspondence corruption counsellor crackdown declaration dedication
density dictator dignity disposal disturbance diversity establishment
evolution eyewitness facility fellowship feminism feminist fixture
generosity gesture guardian handover homelessness insecurity insider
interference interpreter invasion isolation lawmaker likeness maintenance
manufacturer narrator necessity negotiation newcomer novelist obedience
occurrence offender optimism optimist organism outsider patience patriotism
pessimism pessimist physician pianist productivity psychiatrist reformer
regulation reliability reluctance remainder renewal resemblance reservist
residence retailer revival scholarship sensation shutdown sponsorship
standoff superiority takeover therapist transformation upturn vegetarian
wilderness withdrawal wrongdoing
`;

// The other side of the split described above CM_BASES, and the same argument
// UP_DERIVED makes: the base is recoverable but its sense is not handed to you
// by the derivative. `migration` does not give you `migrate` used of a person,
// `intention` does not give you `intent`, and `institution` and `institute`
// are two different objects in a news sentence. Cards, at ~B2.
const UP_BASES = `
amend conserve corrupt dense elder implicate incline indict inflate
institute intent interact legislate migrate populate proliferate prosecute
resent retaliate situate televise utter vindicate volatile
`;

// The rest of the band-4 reclassification. These stay cards — they are worth
// teaching — but at ~B2 rather than ~C1, and, more to the point, they no longer
// outrank a band-2 entry. `regulation` is band 2 by CM_DERIVED and `regulate`
// was band 4; with band 4 checked first, the pair disagreed about the same
// word depending on which form the article happened to use.
const UP_FROM_ACADEMIC = `
albeit nonetheless nevertheless moreover furthermore
acquire adequate administrative advocate alter ambiguity ambiguous apparent
arbitrary arise assess asset assumption attain categorise classify commerce
comparable concept conceptual condemn consequent conservation considerable
constitution constitutional contextual controversial criteria criterion
deficit derive deteriorate differentiate diminish disputed distinct
distinction distinguish domain endorse enforce enhance equivalent evident
explicit feasible framework functional fundamental hierarchy illustrate
implication implicit imply impose infrastructure inherent institution
institutional integrate intentional interaction interpret interpretation
legislation legislative liability mechanism migration modify parameter
perspective plausible presume principle regulate relevance respective
revenue rural sceptical scope significance structural subjective subsequent
subsequently substantial sustain sustainable theoretical underlying urban
validate variable verify viable welfare widespread
`;

// The same reckoning as CM_HOMOGRAPHS, one band up. A learner does not
// reliably hold these, so unlike `china` and `pole` they are worth a card —
// which is the answer that costs a click if the article meant the island of
// Jersey, and withholds nothing if it meant the shirt.
const UP_HOMOGRAPHS = `
jersey cardigan mandarin bass swede
`;


// The common core that was grading C1+, imported.
//
// WHAT WAS WRONG. Band 5 is every word in no list, and it is shown to the
// teacher as ~C1+ with BAND_WEIGHT 3.0, the heaviest there is. Only 4,427
// words were banded at all, so "not in our list" was doing the work of
// "rare" — `reading`, `writing`, `content`, `block`, `stock`, `account`,
// `paragraph`, `commission` and `era` all graded C1+, and on three fixture
// decks between 60% and 93% of every card wore that badge. Absence was being
// scored as rarity, which is why the deck put the most ordinary unbanded word
// above the rare vocabulary it exists to teach.
//
// WHERE THESE CAME FROM. The band-candidate script run over SCOWL sizes 10
// and 20, which are SCOWL's two smallest lists: the words a spell checker keeps first. Every
// filter the shipped code applies was applied, plus the taboo list, the
// proper nouns, the degree forms and the inflected forms. 12,533 entries
// read, 2,245 proposed, and this is that batch entire.
//
// SIZES 35 AND ABOVE ARE DELIBERATELY NOT HERE. SCOWL sizes are spell-checker
// tiers and not a frequency ranking, so size 35 holds `aardvark`, `abacus`
// and `abate` beside `paragraph`. Measured on the fixture decks, size 35 is
// where the genuinely upper-band words live — `convened`, `ensuing`,
// `entrench`, `rebuttal`, `substantiate`, `ephemeral` — and demoting it would
// move the error to the other end. Sizes 10 and 20 caught all 41
// plainly-wrong cards and left all 28 correct ones alone.
//
// AND THEY ARE IN BAND 3 RATHER THAN BAND 2, for the reason band 4's header
// gives about band 1: harvest drops bands 1 and 2 outright, so a word filed
// there is silently withheld from a deck the teacher is building, with no
// gesture that recovers it. Band 3 is the recoverable error — the card is
// shown, and an unticked box costs one click. Routing size 10 to band 2 was
// measured and dropped five cards from one fixture deck; this routing changes
// no card count anywhere.
//
// TWO OF THE 2,245 WERE WITHDRAWN, and both were found by the band invariants
// rather than by reading the list. `doe` is a base form and passed every
// filter, but banding it gives the silent-e restore a known word to prefer:
// `doing` reduced to `do`, then `do` + `e` matched, and `doing` began filing
// under a female deer. A deer is not worth `doing`. `thous` was the batch's
// only dead entry — the lemmatiser reaches something else first, so nothing
// could ever have looked it up.
const UP_ORDINARY = `
aardvark abbreviate abbreviation abide abnormal abnormally abolish
abolition abort abortion absorb abstract abstraction absurd abuse
abusive abysmal academic accelerate accent acceptable access accessible
accidental accidentally accommodate accommodation accomplish accordance
account accountant accuracy accurate accurately accustom ace acid acorn
acoustic acquaintance acquisition acronym act action activate adaptation
addict addictive additional additionally adjective admirable admiration
admittedly adopt adoption advance advantageous advent adventure
adventurous advisable advisor advisory aerial aesthetically affair
affection afterward agenda agent aggressive ago agony agricultural aid
aircraft akin album alcohol alcoholic alert algebra algebraic algorithm
alien align alignment alike allergic alleviate allocation allowable
allowance ally alpha alphabet alphabetic alphabetical alteration
alternate altogether amateur ambassador amber ambient amp amplifier
anagram analog analogue analyst anarchy anatomy ancestor anecdote angel
angle anguish anniversary annoy annoyance anorak anthology anticipation
antidote antique antisocial anyplace apathetic apathy apology apostrophe
appall appallingly append appendix applause applicable applicant
appraisal appropriate appropriately approximation apt arc arcade arcane
arch archive arguable arguably arithmetic array arrogance arrogant
artificial artificially artistic ascend ash ashcan ass assault assist
assistant assort asterisk astronomer astronomy asynchronous ate atheism
atheist atmosphere atmospheric atom atomic atrocity attendant attitude
attorney attractive audible audio authorization autobiography automate
automobile await award awkward axiom axis backbone backlog backspace
bacterium badge baffle baggage ballet banal banana bandwagon bandwidth
bang bankrupt bargain bark baroque barrel barrister bash basically
bastard bat batch bathroom baud bay beam beast beaten beauty beforehand
behalf behavior belief believable beneficial beta beware bible biblical
bigot bigotry billfold binary bind biochemistry biography biological
biologist biology bishop bit bitmap bizarre blackboard blackmail blade
blank blast bless blink bliss blob block bloody blurb bog boggle bogus
bolt bond booklet bookshop bookstore boom borderline bore boredom bound
bout bow bracket brake brass breakdown bred breeze brethren brigade
broadcast browse brutal bubble buck budget buffer bulb bulk bull
bulletin bump bunch bundle bust bye bypass byte cable caffeine cage
calculation calculator calculus cam campus cancer canonical cant capital
carbon cardboard carriage cartridge cassette cast catalog catastrophic
categorically cathedral catholic cattle causal causality cave caveat
cease cellular censor censorship ceremony certainty certificate chairman
chamber champagne chancellor changeover channel chaotic chap chapel char
character characteristic charitable charm chart chemical chemistry chess
chestnut childish chip choir choral chord chorus chuck chunk cider circa
circuit circuitry circular circulate circulation circumstance
civilization civilize clarification clash classical classification
clearance client clinical clip clique clog clone closet clothe clumsy
cluster coarse cobbler code coincide coke collaboration collate colon
colony column combat comic comma commandment commentary commentator
commission communal compact companion comparative comparatively
comparison compassion compatibility compatible competitive compilation
complacent complaint complement completeness completion compliment
composite composition compound comprehensible comprehension compress
compression compulsion computation computational compute computerize con
concatenate conceivable conceivably concentration conception concerto
concrete concur condemnation condense conditional condom condone
confidentiality configuration configure confirmation conform congest
congestion congratulate conjecture conjunction connector connotation
conscience consciousness consecutive considerate consistency consolation
console constituency constraint constructive consultancy consultant
consultation contempt content contention contest continent continental
continuation continuity continuous continuously continuum contour
contraception contract contradict contradiction contradictory contrary
contravention contributor contrive converse conversely conversion
convincingly cookie coordination copyright core corn corporation corpse
correction correspondent cosmic cosmology counsel counterexample
counterpart countless county courier courtesy cozy craft cramp crap
crass creator creature creed cricket criminal crop crossroad crossword
crude cruelty cruise crunch cryptic crystal cube cubic cuckoo cuddly cue
culprit cult cultural cumbersome currency curry curse cursor curve
custard customary cylinder cynic daft damn damnation dash database datum
daylight daytime dead deadly debatable debug debugger decay decent
decimal deck declining decode deduction deed defect defective defensive
deficiency defy degenerate degradation degrade deity delete deletion
delicate delight delightful delivery delta delusion democratically
demolish denominator denote departmental dependence deposit depress
depression depth deputy derange derivative derogatory descend
descriptive desert desirable desire desktop despair despise destination
destine destructive detach detectable detector deter detract devastate
deviation device devil devious devoid diagnosis diagnostic diagonal
diagram dial dialect dialog dialogue diameter dice dictate dictatorship
dictionary diesel differential digit dim dimensional dine diner dip
diplomatic dire directory disable disadvantage disastrous disc discard
discharge disciplinary discipline disclaimer disco disconnect
discontinue discovery discrepancy discrete discriminate discrimination
disguise disgust dishonest disk dislike dismal disorder disposable
dispose disposition disregard disruption dissertation dissimilar
distasteful distortion distract distress disturb ditch ditto dive divert
divine divorce documentary documentation dodge dogma dole dominant don
doom dose doubtful doubtless downhill downright draft dragon drain drama
dramatically drastically drawback dread dreadful dreary drift drill drip
drivel drown drunken dual due duff dug duly dumb dummy dump dumpster
duplicate duplication duration dustbin dying dynamically ease eaten echo
ecological ecology economical economically edit editorial efficiency ego
electoral electorate electrical electron electronically elementary
elevator eliminate elite elitist embarrass embarrassment emerging emit
emphasis empire emulate emulation emulator enable enclose encode endless
endlessly enhancement enjoyable enlarge enlighten enlightenment
enterprise enthusiasm entirety entitle entry envy epic episode equate
equation equilibrium era erase eraser ergo err erroneous esoteric essay
essence estimation eternal eternity ethnic etymology evaluation evil
evolutionary evolve exaggerate examination exceedingly exceptional
exceptionally excess excessive excessively exclamation exclusion
exclusive exclusively executable execute execution executive expedition
experimental experimentally experimentation expertise expire expiry
explanatory exploitation explosive exponential expose expressway extant
external externally extinction extraction extraneous extraordinarily
extraordinary eyesight factual factually faculty faint fairy fallacious
fallacy fan fantasy farce fare farewell farthest fascinate fascist
fashionable fat fate fatuous faucet faulty favorable feat fed feeble
feedback fellow fender fiber fiction fictional fiddle filter filthy
finalize finding firework fizzy flash flavor flaw fleet flesh flip flood
floppy fluctuation fluffy fluid flush flute foam focus folk font fool
footnote forbade forbid forbidden forcibly foreseeable forgiven format
formula formulae formulation forth fortnight fossil foul fraction
fragment freak freeway frequency friction frown frustrate frustration
fry fudge fume functionality fund fundamentalist funding furry fuse
fusion fuss fussy fuzzy galactic galaxy garbage garble gasoline gasp
gateway gay gear gender gene generalization generalize generator genetic
genetically genetics genius genre gentleman gentlemen geographical
geography geology geometry ghastly ghost giant gibberish gig gin
girlfriend glean glory glossy glow glue gnome god goldfish goody gospel
gossip gotten gown graffiti graffito grammatical grand graph graphic
graphical grasp gratuitous gratuitously grave gravitational greasy greed
greedy grid grief grind groan gross grossly growing guarantee guilt
guinea gulf gullible gum gut gutter guy hack hacker hail haircut hairy
halve ham handbook handful handicap handy hangover hardback harden
hardware hardy harmless harmony harsh hash hassle hasten hasty havoc hay
hazy heap heartily heaven hell henceforth herd hereby heresy heroic
heroin heterosexual hexadecimal hey hideous hideously hierarchical
highlight highway hilarious hindsight hint hip historical historically
history hitherto hog holy homosexual homosexuality honorary hopeless
hopelessly horde horizontal horizontally horrendous horrendously horrid
horrific horrify horror household huh hum humorous hut hydrogen hyphen
hypocrisy hypocrite hypocritical hysterical icon idealistic
identification ideological idiom idiosyncratic idiot idiotic illiterate
illogical illusion imaginary imaginative imbalance immature immoral
immortal immune impend imperfect imperial impersonal implementation
import impractical imprison improbable impulse inability inaccuracy
inaccurate inane inappropriate incapable incarnation inch incidence
inclusion inclusive incoherent incompetence incompetent incomplete
incomprehensible inconsistency inconvenience inconvenient incorrect
incorrectly increasing increment indefensible indent indeterminate index
indicative indicator indirect indirection indirectly indistinguishable
induction indulge ineffective inefficiency inefficient inertia
infallible infant infantile infelicity inferior inferiority infinity
inflexible inflict info informative infrequent infringement ingredient
inhabitant inherit inheritance inhibition initialization initialize
injustice innocence input inquiry insane insensitive insertion insidious
insignificant insofar instrumental intact intake integer integration
intellect intellectual inter interactive interactively intercourse
interface interfere interior intermediate interrogate intersection
intimate intolerance intrinsically introductory intuitive invade invalid
invalidate invaluable invariably inverse invert ion irate ironic
irrational irrelevant irrespective irresponsible irritate irritation
item jail jargon jerk jest jet journal junction junk jury justifiable
justifiably justification juvenile ken kernel kettle keystroke keyword
kidnap kidney kingdom kit knight laboratory lad lady lag laid lain
landlord landscape lane lark latter lavatory layout leach leaflet league
leak legendary legible leisure lesbian lest liable liaison libel liberty
lifestyle lifetime linear linguistic linkage liquor lisp lit liter
literate load loader lodge logical logically logo lord lousy lump
lunatic lunchtime lurk lust luxury lying lyric machinery magical
magnificent mailbox mainframe mainstream maize malfunction mangle mania
manifestation manipulate manipulation mankind manpower manufacture
marital marvelous mask mass master mate mathematical mathematically
matrix maximize maze meaningless meantime mechanic mechanical mechanics
medium megabyte memorable mentality mercury mercy mere merge merit merry
mess messy metric metro microcomputer microprocessor microwave midday
mighty mimic mindless minimal minimalist minimize mint minus miracle
miraculous miscellaneous misdirect misery misfortune misguide
misinterpret mislead misplace misprint misread misrepresent missile mist
mistaken mistakenly mistook misunderstand misunderstood misuse mnemonic
moan mob mock mod mode moderation modification module mold mole
molecular molecule mom momentarily monarch monochrome moron mortal
motion motto mount muck muddle mug multiple multiplication multiply mum
mumble mummy musical mystic myth mythical mythology nameless nay
needless needlessly negate neglect negotiable neural newsletter nickname
nil node nonsense norm normality nostalgia notation notification notify
noun novelty novice nuisance null numb numeral numeric numerical nun oar
objectionable obligatory oblige obnoxious obscene obscurity obsess
obsession obstruct obtainable occasion offense offensive offhand
omission onus operational opponent oppress oppression opt optic optical
optimization optimize optimum optional optionally opus oral orbit
orbital orchestral orient oriental orientate orientation origin
originate originator outcry outrageous outright outset overdraft overdue
overflow overhead overlap overload overlong overlook overnight overprice
overridden overrode overtime overtone overview overwhelm overwritten
ozone pace pacifier pad painless panel pant paperback par paradise
paragraph paranoia paranoid paraphrase pardon parenthesis parity
parochial parody parse participant particle passion passionate password
patch patent pathetic patronize peak peanut peasant peculiar pedal
pedant pedantic pedantry pedestrian peer pence penguin perfection
periodic periodically peripheral permissible persecute personnel
perverse petty pharmacy phase philosopher philosophical philosophy
phoenix photocopy photograph photographic physic physicist physics
physiology pie pinch pint pipeline pit pitfall plague planetary plaster
playground plea ploy plural poetic poetry pointless poke polar policeman
polynomial pompous pope populace pornography portability portable
portion pose postage postal postmaster postscript poverty practicable
preach precaution precedence precision predecessor predictable preface
preferable preferably prefix pregnancy prejudice prescription presumably
pretentious preview previewer primitive printout privacy privatization
pro proceed processor programmable prone pronoun prophet proportional
proprietary prose prospective prostitute protein prototype proven
provocative pseudo psychological psychologist psychology publicize pulp
pulse pun punctuation puncture punt purge purity pursuit putt python
quantum query quest questionable questionnaire quibble quotation quote
rabid racial rack racket radar radiation radical radically radius rag
rage raid railroad ram random randomly rant rape rash rat rattle rave
razor reactionary reactor readable readership reading realization rear
rearrange rebuilt reception recipient reckon reclaim recognizable
recollection reconsider recovery recreational rectangle rectangular
recursion recursive redefine redirect redundancy reflex reform reformat
refresh refund regain regardless regrettably reign reinstate rejection
relativity relay relief relieve relocation remaining remark remedy
reminiscent rename rend rendition renew repeatable repent repertoire
repetition repetitive rephrase representation representative
reproduction repulsive requisite reread reset resignation respectable
restart restrain restriction resume resurrection retail retract
retrieval reuse revelation revenge reverse revision revolt revolutionary
rewrite rewritten rewrote rhetorical rhyme rid riot rip risky ritual
rival rod roman romance rot rotate rotation roundabout rout routine
routinely rusty sabotage sack sadden saga saint sake salesman salvation
sample sane sanity sarcasm sarcastic satire satisfactorily satisfactory
scarlet scenario scenery scholar scientifically scotch scratch script
scroll scum seal sect sector seemingly segment semantic semantics
seminar sensitivity sentient sentimental separator sequel serial sermon
sex sexist sexual sexuality sexually sexy shaken shaky shareholder shed
shelve shone shook shorten shorthand shove shy sic sicken sigma silicon
simplify simplistic simulation sin sine sinful sinister sir skeleton
sketch skull slag slang slash slid slogan sloppy slot smallish smith
smug snag snail sneak sneaky snobbery socket sod sole solicitor solo
someplace sometime sophisticate sordid soundtrack span spatial
specialize specialty species specifically specification specimen
spectacular speculation sped spigot spike spiral spite spontaneous
spontaneously spoof spool spout sprang sprung spur spurious spy squad
squash stack stagger staircase stale stall standardize standpoint
startle stationary statistic statistical statistics status stereo
stereotype stimulation stock straightforward stray strengthen strip
strive stumble stun stunt submission subroutine subscribe subset
subsidiary substitute substitution subtlety succession successive
suffice suffix suicidal suicide suitability suite sum summarize sundry
sunk sunlight sunrise sunshine superior supernatural supervise
supervision supplementary supposedly suppression surgery surname
suspension suspicion swamp swap sweat sword symbolic symmetric symmetry
sympathetic sympathize symphony symptom syndrome synonym synonymous
syntactic syntactically syntax synthesizer tab tack tactic tactical
tactless tag tale tame tangent tasteless taxation taxpayer teapot
technological tedious teenage telescope tempt temptation termination
terminator terminology terrify terror terse textbook textual thee theft
theological theology theorem therapy thereafter thereby therein thereof
thesis thieve thirst thoroughfare thou throughput thrust thy tile till
timescale tiresome toad toggle token tolerant toll tome ton tonight
topical torture toss tragedy training transcript transit transmission
transparent trash trashcan tread trek trendy tribe trifle trilogy
trinity triple triumph trivia trivial trivially troop trouser truncate
trusty turntable tutor tutorial twice tying typeset typewriter ugh
unacceptable unambiguous unavailable unavoidable unaware unbearable
unbelievable unbelievably uncertain uncertainty unclear uncommon
underestimate undergone undergraduate underlain underlay underlie
underline understandable underwent undesirable undid undo undone uneasy
unexpectedly unfamiliar unfriendly unhealthy unhelpful unify unimportant
unity unlike unload unnatural unobtainable unofficial unpopular
unpredictable unread unreadable unrealistic unreasonable unreliable
unsafe unsatisfactory unseen unset unsound unstable unsuccessful
unsuitable unsure untidy unto untrue unusable unwelcome unwise
unworkable upgrade upright upside upward urgency usable user utility
vacancy vacation vain valve vandalism vanish variant vat vector vein
velocity vend vendor venue verb verbatim verbose verification verse
vessel vet vicar vice viewpoint vigorously vile vintage vinyl violate
violation virgin void voltage volunteer vomit vouch vowel wade waffle
ward warehouse warp warranty wartime wary wasteful weary weasel wed wee
weekday whale whatsoever whence whereby whereupon whilst whim whiskey
wholeheartedly whoop width wit witch witty wive wizard woke woken wombat
wondrous wont workable workload workshop workstation worship worthless
worthwhile worthy wow wrath wren writing yeti zero zoom
`;

const UP_GROUPS = [
  UP_VERBS, UP_NOUNS, UP_MODIFIERS, UP_ADVERBS, UP_DERIVED, UP_BASES,
  UP_FROM_ACADEMIC, UP_HOMOGRAPHS, UP_ORDINARY
];

// ------------------------------------------------------------
// BAND 4 — ACADEMIC
//
// Vocabulary that recurs across academic subjects regardless of topic. This is
// what makes selection feel deliberate rather than merely rare: a word here is
// worth teaching even when it is not especially uncommon.
//
// INVARIANT: no entry may also appear in band 1. Band 1 is checked first, so
// an overlapping entry would be dead data — logic.test.js asserts the two sets
// are disjoint so the data cannot rot quietly.
//
// THE TIE-BREAK, when a word plausibly belongs in both.
// "research", "industry" and "population" are all common enough for band 1 and
// academic enough for band 4, and arguing them one at a time produces an
// inconsistent list. The rule is: WHEN IN DOUBT, BAND 4.
//
// The two errors are not symmetrical. A word wrongly in band 4 reaches the
// review table, where the teacher sees it and unchecks it — one click, and
// they knew it happened. A word wrongly in band 1 is silently withheld from a
// deck they are building; they never learn it was a candidate, and there is no
// gesture that recovers it. Band 4 is the recoverable error, so uncertainty
// resolves there.
// ------------------------------------------------------------

// Research, evidence and argument — the vocabulary of making and defending a
// claim, which is what most academic reading asks a student to follow.
const AC_INQUIRY = `
analyse analysis evaluate
hypothesis paradigm
empirical phenomenon
methodology
claim assert contend postulate
infer inference deduce
`;

// Structure and relation — how a text organises ideas and how ideas connect.
const AC_STRUCTURE = `
constituent
intrinsic
correlate correlation
analogous
preceding
`;

// Change, causation and constraint — the verbs and nouns of what acts on what.
const AC_PROCESS = `
constitute comprise incorporate
constrain
facilitate
induce
`;

// Institutions, policy and economy — the register of serious journalism, which
// is what a teacher is most likely to be assigning.
const AC_CIVIC = `
statute regulatory jurisdiction
sovereignty
bureaucracy
fiscal monetary expenditure
demographic
`;

// Judgement and stance — words that carry a writer's attitude, and the ones
// students most often miss when they read for facts alone.
const AC_STANCE = `
nuance
manifest conspicuous
inadvertent
tenable
negligible
predominant prevalent ubiquitous
contentious
refute rebut concede
scrutiny scrutinise
`;

const AC_GROUPS = [
  AC_INQUIRY, AC_STRUCTURE, AC_PROCESS, AC_CIVIC, AC_STANCE
];

// ------------------------------------------------------------
// GIVEN NAMES
//
// The proper-noun heuristic in vocab-core.js reads capitalisation away from a
// sentence start, because that is the only signal the text itself carries. It
// is right about "Aldana" and it cannot be right about "Donald Trump is trying
// again", where the capital is explained by the position and the heuristic
// must let it through. A live article put "donald" on a flashcard.
//
// So this is the one place where a list is genuinely cheaper than a rule.
//
// CONSULTED ONLY FOR BAND 5. "mark", "bill", "grace", "will", "rose", "hope",
// "april" and "frank" are all names and all ordinary words, and a list like
// this one would suppress the words along with the names. It never gets the
// chance: those are already band 1 or 2, and this set is asked only about a
// word no band claimed. That ordering is what makes a crude list safe.
// ------------------------------------------------------------
const GIVEN_NAMES = `
aaron abigail adam adrian aisha alan albert alberto alejandro alex alexander
alexandra alfred ali alice alison amanda amara amelia amir amy ana anders
andrea andrew angela angus anita ann anna anne annie anthony antonio arthur
ashley aisling barbara barry beatrice benjamin bernard beth betty bianca
bradley brandon brenda brian bruce bruno bryan caleb cameron carl carla carlos
carmen caroline carolyn catherine cathy cecilia chandra charles charlotte
cheryl chloe chris christian christina christine christopher cindy claire
clara clarence claude claudia clifford clive colin connor conor cormac craig
cristina curtis cynthia daniel daniela danielle darren dave david dean debbie
deborah declan denis denise dennis derek diana diane diego dmitri dolores
dominic donald donna doreen doris dorothy douglas duncan dustin dylan edith
edward edwin eileen elaine eleanor elena eliza elizabeth ellen emily emma eric
erica erik ernest esther ethan eugene eva evelyn ewan fabio farah fatima
felipe felix fernando fiona florence francesca francis francisco frances
franklin fraser freda frederick gabriel gabriela gareth garry gavin geoffrey
george georgia gerald geraldine gerard gillian giovanni gloria gordon 
greg gregory guillermo gustavo hamish hannah harold harriet harry hassan
heather hector heidi helen helena henry herbert hilary hiroshi hugh
hugo ian ibrahim ida ignacio imran ingrid irene irma isaac isabel
isabella ismail ivan jack jackie jacob jacqueline jaime jake james jamie jan
jane janet janice jared jasmine jason javier jean jeffrey jennifer jenny
jeremy jerome jerry jessica jesus jill jim joan joanne joaquin joel john
johnny jonathan jordan jorge jose joseph josephine joshua juan judith julia
julian julie juliet justin kamal karen karl kate katherine kathleen kathryn
katie keith kelly kenneth kevin khalid kim kimberly kirsten krishna kristen
kyle lars laura lauren lawrence leah lee leo leonard leslie lewis liam lila
lillian linda lisa liu lloyd logan lorraine louis louise lucas lucy luigi
luis luke lydia lynn madeleine madison mahmoud malcolm manuel marc marcel
marco marcus margaret maria marian marie marilyn mario marion marius marjorie
marlene marta martha martin marvin maryam mateo mathias matilda matthew
maurice maureen maxwell megan mehmet melanie melissa mercedes mia michael
michele michelle miguel mikhail mildred milton mira miranda miriam
mohamed mohammed monica morgan muhammad murray nadia nancy naomi natalie
nathan neil nelson nicholas nick nicola nicole nigel nina noah noel nora norma bob pat
oliver olivia omar oscar oskar owen pablo pamela patricia patrick
paula paulo pedro peggy penelope percy peter philip phillip phoebe pierre
priya rachel rafael ralph ramon randall raul raymond rebecca regina renee
reuben rhona ricardo richard rita robert roberta roberto robin roderick
rodney roger roland ronald rory rosa rosemary roy ruben ruth ryan sabrina
sally salma samir samuel sandra sanjay sara sarah scott sean sebastian selina
serena sergei seth shane shannon sharon shaun sheila shirley sian sidney
simon sofia sonia sophia sophie stanley stella stephanie stephen steven
stuart sudha susan suzanne sven sylvia tamara tania tara ted teresa terrence
theodore theresa thomas tiffany timothy tina tobias todd tomas tracy travis
trevor tristan tyler ulrich ursula valerie vanessa vera verity veronica
victoria vincent virginia vivian vladimir walter wanda warren
wayne wendy wesley wilbur wilfred willem william wilson winifred yasmin
yolanda yusuf yvonne zachary zainab zara zoe
`;

// Names that are also ordinary words. They are listed DELIBERATELY, because
// leaving them out would make the band-first ordering above an untested claim
// rather than a property — logic.test.js asserts each of these is in the list
// and still wins its band, so the ordering is checked at its sharp end and not
// merely asserted in a comment.
//
// "frank" needed a band before it could go here: it was band 5, so adding the
// name without adding the adjective would have suppressed a word worth
// teaching. That is exactly the failure this list risks, caught by writing the
// test first.
const AMBIGUOUS_NAMES = `
mark bill will grace hope faith joy dawn april june may rose art frank
rob jack sue ray dean rich sunny
`;

// ------------------------------------------------------------
// PLACES AND NATIONALITIES
//
// Measured: 143 of 144 nationality adjectives and 85 of 86 country
// names were band 5, which is a card. Every nationality in every news article
// was going out as vocabulary worth teaching.
//
// THE CENSUS ALREADY CATCHES MOST OF THESE AND REMAINS THE GENERAL MECHANISM.
// "the Israeli military" puts a capital well away from a sentence start and
// looksLikeName settles it with no list at all. What the census cannot see is
// a proper noun that only ever OPENS a sentence — the identical gap `donald`
// fell through. A live article filed exactly that card, and the giveaway is
// its context sentence: "Israeli forces storm West Bank town of Tammun" is a
// HEADLINE, so the capital is fully explained by position and the census is
// right to decline. A list is the only thing that reaches this case.
//
// Consulted only for band 5, exactly as the given names are.
//
// THE LIST IS BOUNDED, AND CITIES ARE DELIBERATELY NOT IN IT. Countries and
// nationalities are a closed class of a few hundred and can actually be
// finished. Cities, rivers, agencies and firms are open-ended; a partial list
// of them would look like coverage while being none, and would take the
// pressure off the census, which is the thing that genuinely generalises.
// Whether the census actually catches them is an open measurement, tracked
// outside this file rather than half-answered inside it.
// ------------------------------------------------------------
const PLACE_NAMES = `
afghanistan albania algeria andorra angola argentina armenia australia austria
azerbaijan bahrain bangladesh belarus belgium bolivia bosnia botswana brazil
bulgaria burma cambodia cameroon canada colombia congo croatia cuba
cyprus czechia denmark ecuador egypt eritrea estonia ethiopia fiji finland
france gabon germany ghana greece guatemala guyana haiti honduras hungary
iceland india indonesia iran iraq ireland israel italy jamaica japan
kazakhstan kenya kosovo kuwait kyrgyzstan laos latvia lebanon liberia libya
lithuania luxembourg macedonia madagascar malawi malaysia maldive maldives
malta mexico moldova mongolia montenegro morocco mozambique myanmar namibia
nepal netherland netherlands nicaragua nigeria norway oman pakistan palestine
paraguay peru philippine philippines poland portugal qatar romania russia
rwanda samoa senegal serbia singapore slovakia slovenia somalia sudan
suriname sweden switzerland syria taiwan tajikistan tanzania thailand tunisia
turkmenistan uganda ukraine uruguay uzbekistan venezuela vietnam yemen zambia
zimbabwe
england scotland wale wales britain
africa america americas antarctica arabia asia balkans caribbean eurasia
europe oceania scandinavia siberia
gaza crimea kashmir sahara
`;

const DEMONYMS = `
afghan albanian algerian american angolan argentine argentinian armenian
australian austrian azerbaijani bangladeshi belarusian belgian bolivian
bosnian botswanan brazilian british bulgarian burmese cambodian cameroonian
canadian catalan chadian chilean chinese colombian congolese croatian cuban
cypriot czech danish dominican dutch ecuadorian egyptian emirati english
eritrean estonian ethiopian fijian filipino finnish french gabonese georgian
german ghanaian greek guatemalan guyanese haitian honduran hungarian
icelandic indian indonesian iranian iraqi irish israeli italian ivorian
jamaican japanese jordanian kazakh kenyan korean kosovar kurdish kuwaiti
kyrgyz lankan laotian latvian lebanese liberian libyan lithuanian
luxembourgish macedonian malagasy malawian malaysian maltese mexican moldovan
mongolian montenegrin moroccan mozambican namibian nepali nicaraguan nigerian
nigerien norwegian omani pakistani palestinian panamanian paraguayan peruvian
portuguese qatari romanian russian rwandan salvadoran samoan saudi scottish
senegalese serbian singaporean slovak slovenian somali sudanese surinamese
swedish swiss syrian taiwanese tajik tanzanian thai tibetan trinidadian
tunisian turkish turkmen ugandan ukrainian uruguayan uzbek venezuelan
vietnamese welsh yemeni zambian zimbabwean
african american arab arabian arabic asian atlantic balkan baltic caribbean
european latin mediterranean nordic pacific scandinavian transatlantic
brit briton dane finn scot turk arabs
israelis saudis iraqis pakistanis yemenis bangladeshis nepalis somalis
kuwaitis emiratis qataris bahrainis omanis bahraini azerbaijanis thais
jewish muslim hindu buddhist sikh
`;

// Nationalities and places whose spelling is also an ordinary word, listed
// DELIBERATELY for the same reason as AMBIGUOUS_NAMES: leaving them out would
// make the band-first ordering an untested claim. Each is in a band above —
// `polish` and `turkey` were already there, `china`, `pole`, `jersey`,
// `swede`, `cardigan`, `mandarin` and `bass` were band 5 and were banded
// FIRST, in CM_HOMOGRAPHS and UP_HOMOGRAPHS, before this list could suppress
// them. logic.test.js asserts every one of them is here AND still wins its
// band, so the ordering is checked at its sharp end.
const AMBIGUOUS_PLACES = `
polish turkey china pole jersey swede cardigan mandarin bass
`;

const PROPER_NOUNS = new Set(
  (GIVEN_NAMES + AMBIGUOUS_NAMES + PLACE_NAMES + DEMONYMS + AMBIGUOUS_PLACES)
    .split(/\s+/).filter(Boolean)
);

// ------------------------------------------------------------
// AMERICAN SPELLINGS OF WORDS WE ALREADY BAND
//
// Band 5 is absence from every list above, and BAND_WEIGHT puts absence at 3.0,
// the top of the deck. So a word this file holds in one spelling and not the
// other is not merely mis-levelled in the second spelling: it is PROMOTED.
// 52 of the 54 American forms below scored band 5 — `color`,
// `program`, `organization`, `labor`, `defense`, `neighbor` — which means an
// American article handed the teacher its commonest words as ~C1+ cards, ahead
// of everything the bands got right. 27 of the 54 British sides are band 1 or
// band 2, the two bands that SUPPRESS a card, so the same words that can never
// be a card off a British article were the first cards off an American one.
//
// Most news English online is American. This shipped in 0.1.0.
//
// A PAIRED TABLE, NOT A SPELLING RULE, and the arithmetic is why. Applying bare
// `-our`→`-or`, `-ise`→`-ize`, `-re`→`-er`, `-ce`→`-se` and `ll`→`l` to our own
// bands rewrites 426 lemmas that are not variants of anything: `four`→`for`,
// `where`→`wheer`, `since`→`sinse`, `all`→`al`, `notice`→`notise`. This is the
// `speed`→`spe` lesson and the `-est` trap for the third time. A rule that is
// right about `colour` is wrong about `four`, and nothing in the shape of the
// word tells them apart — only the pairing does.
//
// THE KEYS ARE NOT COPIED FROM ANYWHERE. Each one is generated from a word this
// project already authored, by transforming a lemma from the bands above; SCOWL
// was asked one question per candidate — "is this attested, and is it not itself
// British-only?" — and answered yes or no. No list was pasted in and no list
// could have been: the input side is our own bands, so the table cannot contain
// a word we do not already hold. That is the same relationship the
// band-candidate script has with the corpus, and it is what the PROVENANCE
// note at the top of this file requires. A seed script (outside this
// repository) generated the candidates and audited this table against them.
//
// FIVE SEEDED CANDIDATES WERE REJECTED BY HAND, and they are the argument for
// the review step rather than a footnote to it. Attestation alone proposed
// `tyre`→`tier` and `tyre`→`tyer` — `tier` is an ordinary English word, and
// pairing it here would have handed `tier` the band of `tyre` in every article
// in English. It also proposed `fulfil`→`fullfil` and two rare spellings of
// `manoeuvre`. `tyre` needs no entry at all: `tire` is already band 1. So is
// `among` for `amongst`, and `practice` for `practise`. 57 British-only banded
// lemmas, 54 paired, 3 needing nothing.
//
// WHAT THIS DOES NOT DO, deliberately:
//
//   It does not merge the two spellings onto one key. `color` and `colour` in
//   the same article remain two cards. Merging them would put the commonest
//   surface on the front of a card whose back is a sentence quoted verbatim
//   from the article — and promise 4 is that the sentence is the article's,
//   unedited. A card reading `colour` over a sentence that says "color" is a
//   front that disagrees with its own evidence. Scoring is the defect; merging
//   is a separate proposal.
//
//   It does not touch the card face. The front is the surface form the article
//   used, before and after this change. An American reader sees `color`.
//
//   It is one direction only, and the direction is a measurement rather than a
//   preference: of the 4,427 banded lemmas, 57 are British-only spellings and
//   NONE is American-only. There is no second table to write.
// ------------------------------------------------------------
const US_VARIANTS_BLOB = `
analyze       analyse
apologize     apologise
authorize     authorise
caliber       calibre
categorize    categorise
center        centre
color         colour
counselor     counsellor
criticize     criticise
defense       defence
emphasize     emphasise
endeavor      endeavour
favor         favour
favorite      favourite
fulfill       fulfil
gray          grey
grueling      gruelling
harbor        harbour
honor         honour
humor         humour
judgment      judgement
kilometer     kilometre
labor         labour
license       licence
maneuver      manoeuvre
marginalize   marginalise
meager        meagre
meter         metre
mobilize      mobilise
mustache      moustache
neighbor      neighbour
neighborhood  neighbourhood
onward        onwards
organization  organisation
organize      organise
organizer     organiser
program       programme
realize       realise
recognize     recognise
rigor         rigour
rumor         rumour
scrutinize    scrutinise
skeptical     sceptical
skepticism    scepticism
skillful      skilful
stabilize     stabilise
subsidize     subsidise
theater       theatre
traveler      traveller
utilize       utilise
vigor         vigour
willful       wilful
woolen        woollen
yogurt        yoghurt
`;

// Parsed a line at a time and NOT as a flat run of words. A blob split on
// whitespace and taken two at a time re-pairs the entire table off a single
// missing word — every entry after the gap would map to its neighbour's
// spelling, silently, and the file would still load. Here a malformed line is
// one malformed line, and it throws.
const US_VARIANTS = new Map(
  US_VARIANTS_BLOB.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/\s+/);
    if (parts.length !== 2) {
      throw new Error(
        `wordlist.js: US_VARIANTS line "${line}" is not a pair. Each line is ` +
        'one American spelling and the British lemma it scores as.');
    }
    return parts;
  })
);

// ------------------------------------------------------------
// LOOKUP
// ------------------------------------------------------------

function splitWords(blob) {
  return blob.split(/\s+/).filter(Boolean);
}

// ------------------------------------------------------------
// WORDS THAT CAME BACK OUT OF BAND 4
//
// Band 4 is checked BEFORE bands 2 and 3, so anything filed academic outranks
// "the learner already has this" and becomes a card. That ordering is correct
// and stays — see the note above bandOf(). What was wrong is what had been
// filed academic: `create`, `data`, `process`, `policy`, `research`, `method`,
// `finance`, `labour`, `approach`, `function`, `factor`, `context` and about
// 170 more were sitting in band 4 and going out on flashcards off ordinary
// newspaper articles.
//
// THE TIE-BREAK DID NOT CAUSE THIS AND IS NOT BEING REPEALED. "When in doubt,
// band 4" is about doubt, and `create` was never in doubt. What let it rot was
// the CHECK: INVARIANT 3 sampled ordinary words, asserted they were not band 5,
// and said in as many words that band 4 was allowed — so the one band that
// could hold a common word and still ship it as a card was the one band nothing
// measured. `create` is in that sample. The check read it and passed it.
//
// The sorting test was: does a student meet this word in textbooks and essays,
// or in conversation and everyday news? Textbook words stayed. 237 entries
// went through it by hand; 186 moved.
const GS_FROM_ACADEMIC = `
achieve argue create value
`;

const GS_GROUPS = [
  GS_FUNCTION, GS_VERBS, GS_NOUNS, GS_MODIFIERS, GS_PUBLIC, GS_GAPS,
  GS_FROM_ACADEMIC
];

const GENERAL = new Set(GS_GROUPS.flatMap(splitWords));
const COMMON = new Set(CM_GROUPS.flatMap(splitWords));
const UPPER = new Set(UP_GROUPS.flatMap(splitWords));
const ACADEMIC = new Set(AC_GROUPS.flatMap(splitWords));

// THE ORDER HERE IS NOT NUMERIC, AND THAT IS THE POINT.
//
// Band 1 is checked first because it is the one band that SUPPRESSES a card.
// After that the HIGHER band wins, which is the same asymmetry that governs
// band 4's tie-break: a word wrongly shown reaches the review table and costs
// the teacher one click, and they saw it happen. A word wrongly suppressed is
// withheld from a deck they are building, and there is no gesture that
// recovers it because they never learn it was a candidate.
//
// logic.test.js asserts the four sets are disjoint, so this should never fire
// on shipped data. It is written down anyway, because "should never" is not
// "cannot" and a silent wrong answer is worse than a stated one.
function bandOf(lemma) {
  if (!lemma) return 5;
  // The American spelling scores as the entry we hold, BEFORE the four lookups
  // and not as a fallback after them. As a fallback it would read "band 5, so
  // try the variants", which is the same answer for the same reason but says
  // the wrong thing to the next reader: it makes the table a rescue for words
  // the bands missed, when it is a spelling normalisation for words the bands
  // hold. The four checks below then run once, on one key, in their fixed
  // order — band 1 first, because band 1 is the one band that suppresses.
  //
  // One hop, never a chain. INVARIANT 9 holds every key out of all four bands
  // and every value inside one, so no value here is another key and a second
  // lookup could not find anything a first did not.
  lemma = US_VARIANTS.get(lemma) || lemma;
  if (GENERAL.has(lemma)) return 1;
  if (ACADEMIC.has(lemma)) return 4;
  if (UPPER.has(lemma)) return 3;
  if (COMMON.has(lemma)) return 2;
  return 5;
}

// Only ever asked about a word no band claimed — see the GIVEN_NAMES note.
// Callers must check the band first; this set is not safe on its own.
//
// It was `isGivenName` until the places and nationalities landed, and a
// predicate named for given names that answers true to `britain` is a comment
// that cannot go stale quietly — it is a lie in the code, read by whoever adds
// the next list. Renamed with the data, not after it.
function isProperNoun(lemma) {
  return PROPER_NOUNS.has(lemma);
}

// "Do we hold an entry for this?" — the question the lemmatiser asks to settle
// the silent-e problem, which is why it has to know about every band.
//
// This lived in four places in the extension: its popup, two probe scripts
// and logic.test.js, each spelling out `GENERAL.has(w) || ACADEMIC.has(w)` by
// hand. Adding bands 2 and 3 needed all four changed together, and the one
// that got missed would not have failed — it would have quietly lemmatised
// worse than the others, in a way no assertion was watching for. One
// definition, exported, so the next band costs one edit.
// The American spellings answer YES here, and that is what makes the table work
// on inflections without one line of it mentioning a suffix. `analyzed` reaches
// reduce, which offers `analyz`, `analyze` and `analyze`+e to this predicate and
// takes the first hit; previously every candidate was refused and the
// lemma came out `analyz`, which is in no band and never will be. With `analyze`
// held, the -ed rule lands on it and bandOf reads it as `analyse`. `analyzes`,
// `analyzing` and `analyzed` all arrive on the one key by the rules that were
// already here — the table supplies the base and the lemmatiser does the rest.
//
// It is also what stops the silent-e fold mangling the key: `license` is held,
// so it is not folded to `licens`. That fold is the mechanism behind the two
// entries this defect used to get right by accident — `center` folded onto
// `cent`, band 2, and `centre` is band 2, so the answer was correct and the
// reasoning was not. `traveler` folded onto `travel`, band 1, and band 1
// suppresses: the card did not come out mis-levelled, it did not come out.
function isKnown(lemma) {
  return GENERAL.has(lemma) || COMMON.has(lemma) ||
    UPPER.has(lemma) || ACADEMIC.has(lemma) || US_VARIANTS.has(lemma);
}

// ------------------------------------------------------------
// LEVEL
//
// A CEFR-SHAPED ESTIMATE, AND DELIBERATELY NOT A CEFR MEASUREMENT.
//
// The teacher wants to know how hard a word is, and "appears 3 times in this
// article" does not tell them — it tells them about the article. A level does.
//
// But these levels are read off our own bands, which are authored by hand.
// Nothing here has been measured against the Common European Framework, and no
// published levelled list is bundled: Oxford's 3000/5000 carries CEFR levels
// and is Oxford's to license, on terms this product cannot meet. So the bands
// are ours and the levels are an estimate drawn from them.
//
// EVERY SURFACE THAT SHOWS THIS MUST MARK IT AS AN ESTIMATE. A bare "B2" is a
// claim about a standard we did not test against, and this codebase does not
// make claims it cannot support. Band 5 returns "C1+" rather than a single
// level for the same reason: an absent entry means we do not know the word,
// not that we know it to be hard.
// ------------------------------------------------------------
const LEVELS = { 1: 'A2', 2: 'B1', 3: 'B2', 4: 'C1', 5: 'C1+' };

function levelOf(lemma) {
  return LEVELS[bandOf(lemma)];
}

const DEMONYMS_SET = new Set(splitWords(DEMONYMS));

export {
  bandOf, levelOf, isKnown, isProperNoun, LEVELS,
  GENERAL, COMMON, UPPER, ACADEMIC, PROPER_NOUNS, US_VARIANTS,
  // Exported for one check and no runtime caller: the demonyms are the
  // entries English pluralises, and INVARIANT 6 has to know which those are
  // without asking a country list for its plural.
  DEMONYMS_SET as DEMONYMS
};
