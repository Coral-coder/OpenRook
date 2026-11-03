/// Every version of the 3D battle board the app has shipped, kept so a player can go back to
/// one they liked. Each older one is the exact page from that point in the project's history
/// (assets/board3d/iterations/), so it looks and fights exactly as it did; the newest is
/// assets/board3d/board3d.html, built from app/board3d/.
class BoardIteration {
  const BoardIteration(this.id, this.label, this.blurb, this.asset);
  final String id;
  final String label;
  final String blurb;
  final String asset;
}

const boardIterations = [
  BoardIteration('latest', 'Living statues (newest)', 'Still until you pick them up; real swordplay and spells; matte stone that stands out; recorded sounds', 'assets/board3d/board3d.html'),
  BoardIteration('v6', 'Battle scars', 'Wounds that stay, statues that come apart, melting rubble, the wormhole boom', 'assets/board3d/iterations/v6.html'),
  BoardIteration('v5', 'Swordplay', 'Standing on the board, horizontal sword cuts and stabs', 'assets/board3d/iterations/v5.html'),
  BoardIteration('v4', 'Cinematic duels', 'On plinths: full swings, slice/stab/cleave physics, the queen\'s wormhole', 'assets/board3d/iterations/v4.html'),
  BoardIteration('v3', 'Carved stone', 'Detailed carving, cabin and tower rooms, rubble physics', 'assets/board3d/iterations/v3.html'),
  BoardIteration('v2', 'Stone hall', 'The first rebuilt statues with skeletons', 'assets/board3d/iterations/v2.html'),
  BoardIteration('v1', 'Film models', 'The original downloaded pieces, animated like the film', 'assets/board3d/iterations/v1.html'),
];

BoardIteration boardIteration(String id) =>
    boardIterations.firstWhere((i) => i.id == id, orElse: () => boardIterations.first);
