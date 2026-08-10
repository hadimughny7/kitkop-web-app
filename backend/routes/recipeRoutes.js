const express = require('express');
const router = express.Router();
const { getRecipes, createRecipe, updateRecipe, deleteRecipe } = require('../controllers/recipeController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', getRecipes);
router.post('/', authorizeRoles('owner', 'manajer'), createRecipe);
router.put('/:id', authorizeRoles('owner', 'manajer'), updateRecipe);
router.delete('/:id', authorizeRoles('owner', 'manajer'), deleteRecipe);

module.exports = router;
