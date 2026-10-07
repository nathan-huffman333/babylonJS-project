This is my BabylonJS game project for my CSC380-A: Game Engines class.

The asteroids have sound effects for colliding with other asteroids, the player,
and for when they are destroyed. There is also sound effects for the winning and
losing conditions.

Upon spawn, there is 25 asteroids spawned with a random number of large, medium,
and small sized asteroids. When shot, break down into smaller, more simplified asteroids
with less subdivisions/more polygonal sides. The break down from large, medium,
and then small sizes which can then be destroyed.

Something that I had to do outside of the project was learn how to use vite and
add a github workflow rule to automatically compile the game upon syncing to
github, and use github actions rather than "Deploy from branch." Also, in order
to do this I had to add the "vite.config.js" and "deploy.yml" files.