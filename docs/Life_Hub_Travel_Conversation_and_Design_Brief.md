# Life Hub Travel: conversation and design brief

27 September 2026

## Purpose

Travel is a distinct section within the Life Hub website. It inherits the shared Life Hub design kit, navigation, coding patterns, authentication, deployment approach and data boundaries. It works on desktop and mobile. The owner plans trips, follows the journey while travelling, manages changes and costs, and shares a separate view with trusted people.

The initial test is Adam's December 2026 journey from Sydney through Kuala Lumpur and Istanbul, then onward through Europe to South Korea. The Travel section should support future trips too. This document records the whole design discussion, including research, rejected ideas, accepted ideas, mockup feedback and the current direction. A proposed feature is marked as a proposal. The existing mockup is a concept, not an implemented Life Hub page.

## The original request

Adam wanted research into the best, most innovative and intuitive travel planning applications and websites. He wanted a highly personalised travel experience with an itinerary, budget, planning tools and a shareable link. Trusted people should see where he expects to be, when he checked in safely, and how a delay or change altered the plan. His reason is practical: if he goes missing, someone should have an intelligible, current itinerary.

The experience must work on mobile and desktop. It sits somewhat apart from the existing hubs while using the Life Hub design kit and code. Adam asked for features with a genuine sense of surprise and originality.

## Research findings

The first research pass examined official product pages and help documentation. This was desk research, not hands on testing within each product.

1. [Wanderlog](https://wanderlog.com/) connects daily plans, reservations, maps, route order, budgets, packing and collaboration. Its main lesson is the value of one connected trip record.
2. [TripIt](https://www.tripit.com/web) parses booking confirmations into an itinerary. Its [travel guidance](https://help.tripit.com/en/support/solutions/articles/103000322041-tripit-pro-travel-guidance) relates entry, health and safety information to nationality, dates and the country travelled from.
3. [Flighty](https://flighty.com/) excels at current flight status, inbound aircraft, gate changes, delay information and connection assistance. Its [delay explanation](https://flighty.com/help/delay-predictions) distinguishes predictions from official airline times.
4. [Tripsy](https://tripsy.app/) connects documents, email imports, activity details and expense tracking. Its [web sharing](https://tripsy.app/updates) permits a read only itinerary link, document visibility control and link revocation.
5. [Polarsteps](https://www.polarsteps.com/) makes a journey attractive to follow. Its [location controls](https://support.polarsteps.com/hc/en-us/articles/34424572094482-Hide-your-live-location-on-Polarsteps) permit route sharing without revealing the latest live location.
6. [FindPenguins](https://findpenguins.com/) supports [delayed route sharing](https://support.findpenguins.com/hc/en-us/articles/4406285935762-How-do-I-share-my-travel-route-with-a-time-delay).
7. [TravelSpend](https://travel-spend.com/) emphasises fast expense entry, offline use and currency conversion.
8. [Rome2Rio](https://www.rome2rio.com/) compares transport modes, routes, estimated duration and costs.
9. [Stippl](https://www.stippl.io/itinerary-planner) joins route, daily timeline, budget, packing and a travel record.
10. [Apple Check In](https://support.apple.com/guide/personal-safety/use-check-in-for-messages-ips56b5bc469/web) provides a destination or timer check in, an opportunity to extend time, and selected information for a trusted contact after a missed response. Its documentation notes that location sharing through Check In is unsupported in South Korea.
11. [Smartraveller's solo travel guidance](https://www.smartraveller.gov.au/news-and-updates/safety-tips-solo-travellers) recommends sharing a detailed itinerary, accommodation contacts, key documents, emergency contacts and regular check in plans with a trusted person.

The initial synthesis merely combined existing product features. Adam rejected that as insufficiently original. Research remains useful as a reference and quality benchmark. The product concept must have its own organising idea.

## Current product idea

Travel is a living journey with a state and a memory.

One route has three distinct layers:

1. Planned: where Adam intends to go, with bookings and flexible ideas clearly distinguished.
2. Expected now: the current route after delays or deliberate changes.
3. Confirmed: events and locations Adam has explicitly checked in or verified.

The route itself communicates state. A future leg, a confirmed arrival and a disrupted connection look different. A delay visibly changes the relevant segment. The original plan remains available, so a change does not erase history. On mobile, the emphasis shifts to the current location, next action and nearby context. Desktop shows the larger journey and permits detailed planning.

After travel, the same route becomes a replay of planned and actual movement, decisions, delays, added places and extra spending. Future trips can use patterns learned from Adam's real travel, such as preferred transfer time and realistic spending. This is a proposed design direction, not an existing feature.

## Something broke: reactive travel assistance

Adam rejected a proposed catalogue of hypothetical disruption rehearsals. No set of scenarios would cover every actual problem. He preferred an immediate AI entry point: “Something broke. What are my options?”

The traveller taps the affected part of the route, describes the problem or pastes a message or screenshot. The assistant examines the relevant confirmed bookings, local times, connected transport, accommodation, cost, check in plan and later commitments. It presents workable options, with any uncertain facts clearly labelled. Adam chooses an option and approves changes to the trip and messages to trusted people.

Example: if D7 604 from Kuala Lumpur is delayed, the assistant shows the revised arrival at Sabiha Gökçen, transfer to The Story Hotel Pera, any accommodation consequence, extra spending and the changed check in time with Corey. The old schedule stays in the history. Flight status supplied by an external source, a prediction and an owner confirmed change must have distinct labels.

This is an interaction concept. It requires reliable data sources, clear evidence and explicit approval before a booking or trusted contact record changes. The mockup does not execute AI or contact anyone.

## Trusted contact experience

Adam considered a separate trusted contact view a base requirement, rather than the headline innovation.

The owner view asks: “What do I do next?” The trusted view asks: “Where did Adam plan to be, what has he confirmed, what changed and when is his next check in?” The view should show the last confirmed safe update, its timestamp, the expected location, forthcoming transport and the agreed response to a missed check in.

“Planned to be here”, “confirmed here” and “live location” must never be presented as equivalent. Missing a check in shows the last successful contact and an agreed sequence of actions. It is not proof of an emergency. Public or broad sharing should offer less detail, perhaps after a delay. Trusted access can contain more, while booking references, financial information and sensitive health documents stay private unless explicitly shared. Links should be revocable.

## Holistic itinerary flow

Adam rejected separate Budget and Documents tabs in the mobile mockup. Costs and documents belong with the relevant event in the journey.

A flight entry contains its times, airports, terminals, carrier, flight number, baggage allowance, ticket, booking access, amount paid and any live change. A hotel entry contains its address, stay dates, check in and check out times, reservation, cost and cancellation terms. A transport or activity entry contains the same relevant practical details. The day flow assembles these entries in order.

A trip total or spending overview can still exist as a derived summary. It should not force Adam to leave the itinerary to find the price or ticket for the event in front of him.

The mobile concept currently uses Itinerary, Travel day and Changes views within the journey. People and trip history are secondary destinations. The design should not turn into a collection of unrelated dashboard cards.

## Visual direction and interaction

Adam rejected the initial neutral dashboard. He asked for a distinctly travel oriented visual language, with tickets, aircraft moving across route lines, place and country identity, colour, playfulness and whimsy. The latest concept introduced:

1. A route from SYD to KUL to SAW with aircraft on the connecting lines.
2. Ticket inspired flight entries with a perforation and a compact boarding pass layout.
3. A destination artwork area at the top. Sydney, Kuala Lumpur and Istanbul each have different colour and skyline forms. Selecting a city changes the scene, title and caption. In the final product, the scene should change with the current trip state or location, while also permitting manual exploration.
4. A sunrise palette and twin towers for Kuala Lumpur, a dusk skyline with domes and minarets for Istanbul, and a Sydney harbour inspired departure scene. These are rough concept illustrations, not final artwork or geographically exact scenes.
5. A Travel day view with actual booked transport and suggested pauses that make the day feel like travel rather than administration.

Adam still found the earlier versions bland. The current artwork and layout are another iteration, not an approved visual design. The eventual country scene should feel like an authored travel experience while keeping critical times, tickets and status easy to read.

## Actual first leg details from Notion

These facts came from Adam's Notion pages [Leg 1: Sydney to Kuala Lumpur](https://app.notion.com/p/340f794f847681cdaf91d45fc1bad4dc), [Leg 2: Kuala Lumpur to Istanbul](https://app.notion.com/p/340f794f84768132850af30f8a9c6b66) and [Stopover: Istanbul](https://app.notion.com/p/340f794f847681e180f7ddfcb718c519). The pages were last edited in August 2026. The design must refresh records before treating the details as current on travel day. Booking references are deliberately omitted from this brief.

| Event | Confirmed details in Notion |
| --- | --- |
| Sydney to Kuala Lumpur | Batik Air Malaysia OD120. Departs Sydney on Tuesday 1 December 2026 at 22:15 local time. Arrives Kuala Lumpur on Wednesday 2 December at 04:10 local time, Terminal 1. Economy, Airbus A330. No meal included. Combined personal item and cabin bag allowance of 7 kg, plus 20 kg checked baggage in the booking. Trip.com recommends arrival at Sydney Airport at least three hours before departure. |
| Kuala Lumpur accommodation | Royale Chulan Kuala Lumpur, No. 5 Jalan Conlay. Superior King Room. Check in after 15:00 on 2 December, check out before 12:00 on 4 December. Two nights, paid A$154.26. No meals included. Early check in was requested, though availability is not confirmed. |
| Kuala Lumpur to Istanbul | AirAsia X D7 604. Departs Kuala Lumpur Terminal 2 on Friday 4 December at 09:35 local time. Arrives at Istanbul Sabiha Gökçen at 16:05 local time. Nonstop, 11 hours 30 minutes. Economy Promo, 7 kg cabin allowance, no seats selected and no meal included. Paid A$428.71 through Expedia. |
| Istanbul accommodation | The Story Hotel Pera, Tomtom, Kumbaracı Ykş. No: 66, Beyoğlu. Four nights from 4 to 8 December. Check in after 14:00 and check out before 12:00. Paid A$296.94. No meals included. Non refundable and cannot be modified. |

The 04:10 arrival in Kuala Lumpur and 15:00 hotel check in create a real planning gap. This should be prominent within the flow. The KL stopover page also records ideas such as Central Market and a SugarBomb fragrance visit. Those are ideas, not reservations.

## Illustrative Travel day itinerary

Adam explicitly asked the mockup to invent itinerary stops. The following times and activities are suggested design content, not confirmed bookings or verified operating hours.

| 2 December, Kuala Lumpur local time | Status |
| --- | --- |
| 04:10, land at KUL Terminal 1 | Booked flight arrival |
| Around 06:00, travel into the city | Suggested estimate, transfer mode to choose |
| Around 07:00, reach Royale Chulan | Suggested estimate, ask about early check in or luggage storage |
| 08:00, a slow breakfast near the hotel | Optional idea after overnight travel |
| 10:00, KLCC and Petronas Towers walk | Optional idea |
| After 15:00, hotel check in | Confirmed hotel policy |
| Evening, Central Market and SugarBomb | Optional idea from Notion, dependent on energy |
| After arrival, check in with Corey | Proposed reminder, exact time to set |

The Istanbul arrival day similarly combines the real 09:35 departure and 16:05 arrival with a suggested transfer to Beyoğlu, hotel check in and a short first evening near Pera. Full market and fragrance exploration belongs on another day. The interface must distinguish booked, suggested, estimated and completed entries.

## Ideas rejected or reduced

1. A record explaining the reason behind every travel choice. Adam said this idea was weak, so it is not a defining feature.
2. A system that rehearses predetermined disruptions. Adam preferred a reactive “something broke” assistant.
3. Treating the trusted contact view as the innovative headline. It remains essential functionality.
4. Separate Budget and Documents sections as primary mobile tabs. Costs and documents belong beside the flight, stay or activity in the journey.
5. Generic cards, muted status dashboards and empty placeholder itinerary entries when actual trip records exist.
6. A feature list assembled from competing products without a distinct organising concept.

## Conversation sequence

1. Adam set the Life Hub Travel brief and asked for deep research and a plan.
2. The assistant proposed research into planning, live travel, money and trusted sharing.
3. The assistant reported findings across travel products and proposed a combined feature set.
4. Adam said the response did not “wow” him because it contained no original concept.
5. The assistant proposed a living trip with a pulse, reasons for decisions, scenario rehearsals, a separate trusted view and a memory of the actual journey.
6. Adam kept the live state and memory. He rejected decision rationales and rehearsals, substituted a reactive AI assistant, and called the trusted view a base expectation.
7. The assistant reframed Travel as a route with planned, expected and actual layers, and the “something broke” interaction.
8. Adam requested a mobile mockup of the Sydney, Kuala Lumpur and Istanbul leg.
9. The first mockup was too sparse. Adam pointed out the absence of flight details, hotel details, time and an itinerary, and asked for a stronger travel theme.
10. A second mockup introduced tickets and an itinerary, though it still used sample data.
11. Adam asked for budgets and documents to sit inside the flow, rather than in separate tabs. The mockup was adjusted.
12. Adam noted the details were already in Notion and criticised the lack of visual energy. The assistant fetched the actual bookings and stopovers and replaced the sample flight and hotel details.
13. Adam asked for a top art area that changes by country and for invented travel day stops. The latest mockup added selectable destination scenes and suggested Kuala Lumpur and Istanbul day flows, while retaining the real flight and hotel details.

## Practical next design decisions

1. Develop a stronger visual system for destination scenes. Test richer artwork, animation and transitions without sacrificing legibility or loading speed.
2. Decide how location state changes the scene. Explicit check ins and itinerary progress are more dependable than assuming constant GPS.
3. Design the exact interaction for “something broke”, including evidence, options, cost impact, approved changes and trusted contact updates.
4. Establish the private owner view, trusted contact view and broader share view, with clear access for booking references and health information.
5. Validate the first leg details against current bookings before implementation. Preserve local time zones and distinguish booked information from illustrative suggestions.
6. Adapt the approved concept to the existing Life Hub design kit and architecture when work on the repository begins.

This brief records the conversation and current direction. No repository change, live travel integration or published trusted contact page resulted from the mockups.
