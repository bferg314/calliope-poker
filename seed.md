# Calliope Poker
## Idea
A completely self hosted poker web site called calliope poker. Provide room codes and supports up to 8 players at a table. Build it with potential for tournaments in mind, but the primary use case will be for 2-8 friends, or one person and any number of bots to be able to play poker.

# Infrastructure
Managed with a single docker compose.
User data is stored in a postgres database.
To keep things simple, the user is given a username for the evening. 
If they want to recover their username from last time, they will type in the random, unique 5 word combination and their user name from last time. They will be given multiple opportunities to get this. They can also change it, but it must be 5 different words at least 3 characters long.
Game state is probably redis or something, your call.
Since it is a browser based game it must handle a user refreshing or something on the device. And they can potentially join using an app in the future, so consider that (again, they key phrase comes into play)
Room codes are needed, along with an easy join by link.
Rooms can be password protected.

# Game PLay
Clean, beautiful, themable poker game, with primary focus on the player. Easy way to check, raise, fold. Spend a good long time planning the design. This needs to be perfect.

Time should be taken to make this look unique, not just a regular claude react app.

There is a buy in at the beginning of the night. Chip types can be customized as well as the buy in value. Re-buys are possible, with the possibility to set a time cut off or number cut off.
A unique aspect of this poker game is the styles of poker available. And entire evening of poker can be locked to one style, say texas hold em, or the game can be chosen by each dealer when it is their turn to deal "Deler's Choice" mode. The modes available out of the gate are standard Hold Em, 5 and 7 card stud, and Omaha. The game type engine should be created in a flexible way so I can add new game types, and so can other users if they so choose. Game end can be last man standing or have a time cutoff, with one last hand played after the time hits, and the ability to extend the time if needed. Statistics are fun too. An end of night report and long term results for users that decide to sign in.
